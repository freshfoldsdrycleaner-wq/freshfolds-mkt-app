import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding Fresh Fold sample data...");

  const admin = await prisma.user.upsert({
    where: { phone: "+910000000001" },
    update: {},
    create: { phone: "+910000000001", name: "Fresh Fold Admin", role: "FRESHFOLD_ADMIN" },
  });

  const dryCleanerOwner = await prisma.user.upsert({
    where: { phone: "+910000000002" },
    update: {},
    create: { phone: "+910000000002", name: "Rakesh (ABC Dry Cleaners)", role: "DRYCLEANER_ADMIN" },
  });

  const customer = await prisma.user.upsert({
    where: { phone: "+910000000003" },
    update: {},
    create: { phone: "+910000000003", name: "Priya Sharma", role: "CUSTOMER" },
  });

  await prisma.user.upsert({
    where: { phone: "+910000000004" },
    update: {},
    create: { phone: "+910000000004", name: "Suresh (Delivery)", role: "DELIVERY_PERSON" },
  });

  const dryCleaner = await prisma.dryCleaner.upsert({
    where: { ownerId: dryCleanerOwner.id },
    update: {},
    create: {
      ownerId: dryCleanerOwner.id,
      businessName: "ABC Dry Cleaners",
      phone: "+910000000002",
      address: "14 Lodhi Market Road, New Delhi",
      latitude: 28.5921,
      longitude: 77.2290,
      operatingHours: "9:00 AM - 8:00 PM",
      status: "ACTIVE",
    },
  });

  const priceList: { category: string; itemName: string; serviceName: string; price: number }[] = [
    { category: "Men's Clothing", itemName: "Shirt", serviceName: "Dry Clean", price: 80 },
    { category: "Men's Clothing", itemName: "Trousers", serviceName: "Dry Clean", price: 100 },
    { category: "Men's Clothing", itemName: "Suit (2pc)", serviceName: "Dry Clean", price: 300 },
    { category: "Women's Clothing", itemName: "Saree", serviceName: "Dry Clean", price: 200 },
    { category: "Outerwear", itemName: "Jacket", serviceName: "Dry Clean", price: 180 },
    { category: "Home Textiles", itemName: "Blanket", serviceName: "Dry Clean", price: 250 },
  ];

  for (const svc of priceList) {
    const existing = await prisma.service.findFirst({
      where: { dryCleanerId: dryCleaner.id, itemName: svc.itemName, serviceName: svc.serviceName },
    });
    await prisma.service.upsert({
      where: { id: existing?.id ?? "___none___" },
      update: { price: svc.price },
      // Seed data is already-approved, live pricing — not a pending submission.
      create: { dryCleanerId: dryCleaner.id, status: "ACTIVE", ...svc },
    });
  }

  await prisma.platformSetting.upsert({
    where: { id: "default" },
    update: {},
    create: { id: "default", commissionRate: 10, effectiveFrom: new Date("2026-01-01") },
  });

  // A second, not-yet-approved dry-cleaner — exercises the admin
  // approvals screen (GET /api/admin/drycleaners?status=PENDING) out of
  // the box, without needing to register one by hand first.
  const secondOwner = await prisma.user.upsert({
    where: { phone: "+910000000005" },
    update: {},
    create: { phone: "+910000000005", name: "Meera (White Show Laundry)", role: "DRYCLEANER_ADMIN" },
  });
  await prisma.dryCleaner.upsert({
    where: { ownerId: secondOwner.id },
    update: {},
    create: {
      ownerId: secondOwner.id,
      businessName: "White Show Laundry & Drycleaning",
      phone: "+910000000005",
      address: "South Delhi Service Area",
      latitude: 28.548,
      longitude: 77.2,
      status: "PENDING",
    },
  });

  console.log("Seed complete:");
  console.log({ admin: admin.phone, dryCleaner: dryCleaner.businessName, customer: customer.phone });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
