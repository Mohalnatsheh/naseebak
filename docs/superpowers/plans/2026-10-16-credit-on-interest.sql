-- CreateEnum
CREATE TYPE "IntroPreference" AS ENUM ('CHAT', 'FAMILY');

-- AlterEnum
ALTER TYPE "CreditReason" ADD VALUE 'INTEREST';

-- AlterTable
ALTER TABLE "mutual_matches" ADD COLUMN     "femaleGuardianShareAt" TIMESTAMP(3),
ADD COLUMN     "maleGuardianShareAt" TIMESTAMP(3),
ADD COLUMN     "openedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "suggestions" ADD COLUMN     "candidateIntroPreference" "IntroPreference",
ADD COLUMN     "recipientIntroPreference" "IntroPreference";
