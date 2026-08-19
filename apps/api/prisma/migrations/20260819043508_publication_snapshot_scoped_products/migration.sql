-- AlterTable
ALTER TABLE "publication_snapshots" ADD COLUMN     "scopedProductIds" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateIndex
CREATE INDEX "publication_snapshots_scopedProductIds_idx" ON "publication_snapshots" USING GIN ("scopedProductIds");
