import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { describe, it } from "node:test";
import { parseFacebookMessengerWebhookPayload, verifyFacebookWebhookSignature } from "@/modules/communications/integrations/facebook";

describe("facebook webhook signature", () => {
  it("accepts a valid x-hub-signature-256", () => {
    const secret = "test-secret";
    const rawBody = JSON.stringify({ object: "page", entry: [] });
    const signature = `sha256=${createHmac("sha256", secret).update(rawBody).digest("hex")}`;

    assert.equal(verifyFacebookWebhookSignature(rawBody, signature, secret), true);
  });

  it("rejects an invalid signature", () => {
    assert.equal(verifyFacebookWebhookSignature("{}", "sha256=deadbeef", "secret"), false);
  });
});

describe("facebook messenger payload parsing", () => {
  it("parses inbound and echo messages with deterministic thread keys", () => {
    const payload = {
      object: "page",
      entry: [
        {
          id: "page_123",
          time: 1710000000000,
          messaging: [
            {
              sender: { id: "user_1" },
              recipient: { id: "page_123" },
              timestamp: 1710000000000,
              message: { mid: "m-1", text: "Hello" }
            },
            {
              sender: { id: "page_123" },
              recipient: { id: "user_1" },
              timestamp: 1710000005000,
              message: { mid: "m-2", text: "Reply", is_echo: true }
            }
          ]
        }
      ]
    };

    const records = parseFacebookMessengerWebhookPayload(payload);
    assert.equal(records.length, 2);

    assert.equal(records[0]?.pageId, "page_123");
    assert.equal(records[0]?.externalIdentityId, "user_1");
    assert.equal(records[0]?.externalThreadId, "page_123:user_1");
    assert.equal(records[0]?.direction, "inbound");
    assert.equal(records[0]?.bodyText, "Hello");

    assert.equal(records[1]?.externalIdentityId, "user_1");
    assert.equal(records[1]?.externalThreadId, "page_123:user_1");
    assert.equal(records[1]?.direction, "outbound");
    assert.equal(records[1]?.bodyText, "Reply");
  });

  it("returns no records for non-page payloads", () => {
    assert.deepEqual(parseFacebookMessengerWebhookPayload({ object: "user" }), []);
  });
});
