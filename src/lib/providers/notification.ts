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

/** Saves the notification and sends a phone push to the user's registered devices. Never throws. */
export class DbPushNotificationProvider implements NotificationProvider {
  async send(payload: NotificationPayload): Promise<void> {
    try {
      const { prisma } = await import("@/lib/prisma");
      const { sendPushToUser } = await import("@/lib/webpush");
      await prisma.notification.create({
        data: {
          userId: payload.userId,
          orderId: payload.orderId,
          title: payload.title,
          message: payload.message,
        },
      });
      await sendPushToUser(payload.userId);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("[notification] failed", (e as Error).message);
    }
  }
}

/** Notify every Fresh Folds admin account. */
export async function notifyAdmins(payload: Omit<NotificationPayload, "userId">): Promise<void> {
  try {
    const { prisma } = await import("@/lib/prisma");
    const admins = await prisma.user.findMany({ where: { role: "FRESHFOLD_ADMIN" }, select: { id: true } });
    const provider = getNotificationProvider();
    await Promise.all(admins.map((a) => provider.send({ ...payload, userId: a.id })));
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[notification] admins failed", (e as Error).message);
  }
}

export function getNotificationProvider(): NotificationProvider {
  const kind = process.env.NOTIFICATION_PROVIDER ?? "db";
  switch (kind) {
    case "mock":
      return new MockNotificationProvider();
    case "db":
    default:
      return new DbPushNotificationProvider();
    // case "fcm": return new FcmNotificationProvider(...)
  }
}
