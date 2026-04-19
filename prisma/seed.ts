import { PrismaClient } from '@prisma/client';
import { hash } from 'bcryptjs';
import { SYSTEM_ABILITY_TAGS } from '../src/lib/ability-tag-data';

const prisma = new PrismaClient();

async function main() {
    const email = 'admin@localhost';
    const password = '123456';
    const name = 'Admin';

    console.log(`Checking admin user: ${email}...`);

    const existingUser = await prisma.user.findUnique({
        where: { email },
    });

    if (existingUser) {
        console.log(`Admin user already exists. Updating defaults...`);
        await prisma.user.update({
            where: { email },
            data: {
                educationStage: 'junior_high',
                enrollmentYear: 2025,
            }
        });
    } else {
        console.log(`Admin user not found. Creating...`);
        const hashedPassword = await hash(password, 12);

        const user = await prisma.user.create({
            data: {
                email,
                password: hashedPassword,
                name,
                role: 'admin',
                isActive: true,
                educationStage: 'junior_high',
                enrollmentYear: 2025,
            },
        });

        console.log(`\nSuccess! Admin user created.`);
        console.log(`Email: ${user.email}`);
        console.log(`Password: ${password}`);
    }

    console.log(`Seeding system ability tags...`);
    for (const tag of SYSTEM_ABILITY_TAGS) {
        const existing = await prisma.abilityTag.findFirst({
            where: { code: tag.code },
            select: { id: true },
        });

        if (existing) {
            await prisma.abilityTag.update({
                where: { id: existing.id },
                data: {
                    name: tag.name,
                    subject: tag.subject,
                    description: tag.description,
                    order: tag.order,
                    isSystem: true,
                },
            });
        } else {
            await prisma.abilityTag.create({
                data: {
                    code: tag.code,
                    name: tag.name,
                    subject: tag.subject,
                    description: tag.description,
                    order: tag.order,
                    isSystem: true,
                },
            });
        }
    }
    console.log(`System ability tags ready: ${SYSTEM_ABILITY_TAGS.length}`);
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
