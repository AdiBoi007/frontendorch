import { createPrismaClient } from "../src/db/prisma.js";
import { hashPassword } from "../src/lib/auth/password.js";
import { toSlug } from "../src/lib/utils/slug.js";

const prisma = createPrismaClient();

async function main() {
  const organization = await prisma.organization.create({
    data: {
      name: "Orchestra Demo",
      slug: toSlug("Orchestra Demo")
    }
  });

  const passwordHash = await hashPassword("Password123!", 12);

  const user = await prisma.user.create({
    data: {
      orgId: organization.id,
      email: "manager@orchestra.local",
      passwordHash,
      displayName: "Demo Manager",
      globalRole: "owner",
      workspaceRoleDefault: "manager"
    }
  });

  await prisma.project.create({
    data: {
      orgId: organization.id,
      name: "Sample Product",
      slug: toSlug("Sample Product"),
      status: "active",
      createdBy: user.id,
      members: {
        create: {
          userId: user.id,
          projectRole: "manager"
        }
      }
    }
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
