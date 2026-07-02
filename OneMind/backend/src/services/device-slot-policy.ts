import type { Kysely } from "kysely";
import type { Database, DeviceSlotRow } from "../db/types.ts";
import { emitLicenseAuditEvent } from "./license-audit.ts";
import { generateUuidV7Like } from "../utils/id.ts";

const MAX_ACTIVE_DEVICES = 2;

export interface DeviceMetadata {
  deviceId: string;
  slotIndex: number;
  activatedAt: string;
}

export interface ReplaceOldestPrompt {
  code: "DEVICE_SLOT_REPLACEMENT_REQUIRED";
  message: string;
  maxActiveDevices: number;
  replaceStrategy: "replace_oldest";
  oldestDevice: DeviceMetadata;
  activeDevices: DeviceMetadata[];
}

export type DeviceSlotPolicyResult =
  | { ok: true }
  | {
      ok: false;
      prompt: ReplaceOldestPrompt;
    };

interface EnforceInput {
  accountId: string;
  deviceId: string;
  replaceOldest?: boolean;
}

function findOldest(slots: DeviceSlotRow[]): DeviceSlotRow {
  return [...slots].sort((a, b) => {
    const timeDiff = new Date(a.activated_at).getTime() - new Date(b.activated_at).getTime();
    if (timeDiff !== 0) {
      return timeDiff;
    }
    return a.slot_index - b.slot_index;
  })[0]!;
}

function toDeviceMetadata(slot: DeviceSlotRow): DeviceMetadata {
  return {
    deviceId: slot.device_id,
    slotIndex: slot.slot_index,
    activatedAt: slot.activated_at,
  };
}

export class DeviceSlotPolicyService {
  private readonly now: () => Date;

  constructor(
    private readonly db: Kysely<Database>,
    now?: () => Date,
  ) {
    this.now = now ?? (() => new Date());
  }

  async enforce(input: EnforceInput): Promise<DeviceSlotPolicyResult> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.db.transaction().execute(async (trx) => {
          const nowIso = this.now().toISOString();
          const slots = await trx
            .selectFrom("device_slots")
            .selectAll()
            .where("account_id", "=", input.accountId)
            .orderBy("slot_index", "asc")
            .execute();

          const sameDevice = slots.find((slot) => slot.device_id === input.deviceId);
          if (sameDevice) {
            await trx
              .updateTable("device_slots")
              .set({ updated_at: nowIso })
              .where("id", "=", sameDevice.id)
              .execute();
            return { ok: true };
          }

          if (slots.length < MAX_ACTIVE_DEVICES) {
            const usedIndexes = new Set(slots.map((slot) => slot.slot_index));
            const slotIndex = usedIndexes.has(0) ? 1 : 0;
            await trx
              .insertInto("device_slots")
              .values({
                id: generateUuidV7Like(),
                account_id: input.accountId,
                slot_index: slotIndex,
                device_id: input.deviceId,
                activated_at: nowIso,
                updated_at: nowIso,
              })
              .execute();
            return { ok: true };
          }

          const oldest = findOldest(slots);
          if (input.replaceOldest === true) {
            await trx
              .updateTable("device_slots")
              .set({
                device_id: input.deviceId,
                activated_at: nowIso,
                updated_at: nowIso,
              })
              .where("id", "=", oldest.id)
              .execute();

            emitLicenseAuditEvent({
              eventType: "license.device.replaced",
              accountId: input.accountId,
              deviceId: input.deviceId,
              stateFrom: "active",
              stateTo: "active",
              reasonCode: "DEVICE_REPLACED_OLDEST",
              details: {
                replacedDeviceId: oldest.device_id,
                replacedSlotIndex: oldest.slot_index,
              },
            });

            return { ok: true };
          }

          return {
            ok: false,
            prompt: {
              code: "DEVICE_SLOT_REPLACEMENT_REQUIRED",
              message: "Device slot limit reached. Replace the oldest active device to continue",
              maxActiveDevices: MAX_ACTIVE_DEVICES,
              replaceStrategy: "replace_oldest",
              oldestDevice: toDeviceMetadata(oldest),
              activeDevices: slots.map(toDeviceMetadata),
            },
          };
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "";
        if (!message.includes("UNIQUE constraint failed") || attempt === 2) {
          throw error;
        }
      }
    }

    throw new Error("Unexpected device slot policy failure");
  }
}
