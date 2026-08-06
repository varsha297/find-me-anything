import { SQSClient } from "@aws-sdk/client-sqs";

import { env } from "../config/env.js";

export const sqsClient = new SQSClient({
  region: env.AWS_REGION,
});
