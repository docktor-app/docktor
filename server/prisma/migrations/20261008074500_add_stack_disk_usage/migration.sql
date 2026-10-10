-- AlterTable
ALTER TABLE "Stack" ADD COLUMN     "backupSizeBytes" BIGINT;

-- CreateTable
CREATE TABLE "StackVolumeUsage" (
    "id" TEXT NOT NULL,
    "stackId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sizeBytes" BIGINT NOT NULL,
    "measuredAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StackVolumeUsage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StackVolumeUsage_stackId_name_key" ON "StackVolumeUsage"("stackId", "name");

-- AddForeignKey
ALTER TABLE "StackVolumeUsage" ADD CONSTRAINT "StackVolumeUsage_stackId_fkey" FOREIGN KEY ("stackId") REFERENCES "Stack"("id") ON DELETE CASCADE ON UPDATE CASCADE;

