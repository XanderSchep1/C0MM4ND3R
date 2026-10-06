-- AlterTable
ALTER TABLE "User" ADD COLUMN     "recoveryCodeHash" TEXT;

-- CreateTable
CREATE TABLE "OwnedCard" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameKey" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "OwnedCard_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OwnedCard_userId_idx" ON "OwnedCard"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "OwnedCard_userId_nameKey_key" ON "OwnedCard"("userId", "nameKey");

-- AddForeignKey
ALTER TABLE "OwnedCard" ADD CONSTRAINT "OwnedCard_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
