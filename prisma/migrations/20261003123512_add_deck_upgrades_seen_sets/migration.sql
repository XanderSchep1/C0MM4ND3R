-- AlterTable
ALTER TABLE "Deck" ADD COLUMN     "upgradesSeenSets" TEXT[] DEFAULT ARRAY[]::TEXT[];
