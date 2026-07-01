export interface MentionImage {
  src: string;
  alt: string;
  mimeType: string;
  byteSize: number;
}

export interface ResolvedMentionContent {
  entityType: string;
  entityId: string;
  displayText: string;
  content: string;
  images: MentionImage[];
  exists: boolean;
}
