export type ParsedS3ObjectCreatedRecord = {
  eventName: string;
  eventTime: string;
  region: string;

  bucketName: string;
  objectKey: string;
  objectSize: number;
  eTag?: string;
  sequencer?: string;

  /**
   * Extracted from our controlled S3 key format.
   * Use only for logging.
   *
   * Database lookup should still use bucketName + objectKey.
   */
  documentIdFromKey?: string;
  ownerIdFromKey?: string;
};

export type ParsedS3Event =
  | {
      type: "test-event";
    }
  | {
      type: "object-created";
      records: ParsedS3ObjectCreatedRecord[];
    };

type UnknownRecord = {
  eventSource?: unknown;
  eventName?: unknown;
  eventTime?: unknown;
  awsRegion?: unknown;

  s3?: {
    bucket?: {
      name?: unknown;
    };
    object?: {
      key?: unknown;
      size?: unknown;
      eTag?: unknown;
      sequencer?: unknown;
    };
  };
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function requireString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(
      `Invalid S3 event: ${fieldName} must be a non-empty string.`,
    );
  }

  return value;
}

function requireNumber(value: unknown, fieldName: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`Invalid S3 event: ${fieldName} must be a valid number.`);
  }

  return value;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function decodeS3ObjectKey(encodedKey: string): string {
  /*
   * S3 event keys can use application/x-www-form-urlencoded
   * encoding, where spaces can be represented using "+".
   */
  return decodeURIComponent(encodedKey.replace(/\+/g, " "));
}

function extractIdsFromObjectKey(objectKey: string): {
  ownerIdFromKey?: string;
  documentIdFromKey?: string;
} {
  const match = objectKey.match(
    /^private\/([^/]+)\/documents\/([^/]+)\/original\//,
  );

  if (!match) {
    return {};
  }

  return {
    ownerIdFromKey: match[1],
    documentIdFromKey: match[2],
  };
}

function parseRecord(input: unknown): ParsedS3ObjectCreatedRecord {
  if (!isObject(input)) {
    throw new Error("Invalid S3 event: each record must be an object.");
  }

  const record = input as UnknownRecord;

  const eventSource = requireString(record.eventSource, "eventSource");

  if (eventSource !== "aws:s3") {
    throw new Error(`Unsupported event source: ${eventSource}`);
  }

  const eventName = requireString(record.eventName, "eventName");

  if (!eventName.startsWith("ObjectCreated:")) {
    throw new Error(`Unsupported S3 event type: ${eventName}`);
  }

  const bucketName = requireString(record.s3?.bucket?.name, "s3.bucket.name");

  const encodedObjectKey = requireString(
    record.s3?.object?.key,
    "s3.object.key",
  );

  const objectKey = decodeS3ObjectKey(encodedObjectKey);
  const extractedIds = extractIdsFromObjectKey(objectKey);

  return {
    eventName,
    eventTime: requireString(record.eventTime, "eventTime"),
    region: requireString(record.awsRegion, "awsRegion"),

    bucketName,
    objectKey,
    objectSize: requireNumber(record.s3?.object?.size, "s3.object.size"),

    eTag: optionalString(record.s3?.object?.eTag),
    sequencer: optionalString(record.s3?.object?.sequencer),

    ...extractedIds,
  };
}

export function parseS3Event(payload: unknown): ParsedS3Event {
  if (!isObject(payload)) {
    throw new Error("Invalid SQS message: body must contain a JSON object.");
  }

  /*
   * S3 sends this special event while validating the
   * notification configuration.
   */
  if (payload.Event === "s3:TestEvent") {
    return {
      type: "test-event",
    };
  }

  const records = payload.Records;

  if (!Array.isArray(records) || records.length === 0) {
    throw new Error("Invalid S3 event: Records must be a non-empty array.");
  }

  return {
    type: "object-created",
    records: records.map(parseRecord),
  };
}
