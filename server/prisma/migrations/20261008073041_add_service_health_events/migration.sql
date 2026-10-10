-- CreateEnum
CREATE TYPE "HealthSource" AS ENUM ('DOCKER_HEALTHCHECK', 'HTTP_PROBE');

-- CreateTable
CREATE TABLE "ServiceHealthEvent" (
    "id" TEXT NOT NULL,
    "stackId" TEXT NOT NULL,
    "serviceName" TEXT NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT,
    "source" "HealthSource" NOT NULL,
    "message" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServiceHealthEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ServiceHealthEvent_stackId_serviceName_createdAt_idx" ON "ServiceHealthEvent"("stackId", "serviceName", "createdAt");

-- CreateIndex
CREATE INDEX "ServiceHealthEvent_createdAt_idx" ON "ServiceHealthEvent"("createdAt");

-- AddForeignKey
ALTER TABLE "ServiceHealthEvent" ADD CONSTRAINT "ServiceHealthEvent_stackId_fkey" FOREIGN KEY ("stackId") REFERENCES "Stack"("id") ON DELETE CASCADE ON UPDATE CASCADE;
