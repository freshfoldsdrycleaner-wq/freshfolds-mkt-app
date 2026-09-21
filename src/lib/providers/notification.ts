/**
 * Section 47: NotificationService.send(userId, notification) abstraction,
 * decoupled from any specific channel so push/SMS/WhatsApp/email can be
 * added later without touching the ~15 call sites listed in section 21.
 */

export interface NotificationPayload {
  userId: string;
  orderId?: string;
  title: string;
  message: string;
}

export interface NotificationProvider {
  send(payload: NotificationPayload): Promise<void>;
}

export class MockNotificationProvider implements NotificationProvider {
  async send(payload: NotificationPayload): Promise<void> {
    // eslint-disable-next-line no-console
    console.log(`[Notification -> ${payload.userId}] ${payload.title}: ${payload.message}`);
  }
}

export function getNotificationProvider(): NotificationProvider {
  const kind = process.env.NOTIFICATION_PROVIDER ?? "mock";
  switch (kind) {
    case "mock":
    default:
      return new MockNotificationProvider();
    // case "fcm": return new FcmNotificationProvider(...)
  }
}
