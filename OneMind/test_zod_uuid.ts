
import { z } from "zod";

const uuidv7 = "019bd34e-0b2d-7549-a73f-6ae62c56e3b6";
const v7Schema = z.string().uuid();

console.log(`Testing UUID v7: ${uuidv7}`);
try {
    v7Schema.parse(uuidv7);
    console.log("SUCCESS: Zod accepts UUID v7");
} catch (e) {
    console.error("FAILURE: Zod rejected UUID v7");
    console.error(e);
}
