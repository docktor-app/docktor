import {prisma} from "../lib/db.js";

export class UserRepository {
    async findAllEmails(): Promise<string[]> {
        const users = await prisma.user.findMany({select: {email: true}});
        return users.map((u) => u.email);
    }

    async count(): Promise<number> {
        return prisma.user.count();
    }
}

export const userRepository = new UserRepository();
