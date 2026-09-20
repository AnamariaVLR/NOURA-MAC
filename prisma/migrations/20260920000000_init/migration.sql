-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "brand" TEXT,
    "barcode" TEXT,
    "category" TEXT NOT NULL,
    "subcategory" TEXT,
    "sizeLabel" TEXT,
    "imageUrl" TEXT,
    "ingredientsText" TEXT,
    "nutritionJson" TEXT,
    "allergensJson" TEXT,
    "additivesJson" TEXT,
    "novaGroup" INTEGER,
    "evidenceSource" TEXT NOT NULL,
    "evidenceSourceKind" TEXT NOT NULL DEFAULT 'OPEN_DATA',
    "evidenceSourceUrl" TEXT,
    "lastVerifiedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Retailer" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "country" TEXT NOT NULL DEFAULT 'AE',
    "websiteUrl" TEXT NOT NULL,
    "connector" TEXT NOT NULL DEFAULT 'hand',

    CONSTRAINT "Retailer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductListing" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "retailerId" TEXT NOT NULL,
    "sizeLabel" TEXT NOT NULL,
    "url" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductListing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ListingCheck" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "priceFils" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'AED',
    "sizeLabel" TEXT NOT NULL,
    "inStock" BOOLEAN NOT NULL,
    "photoPath" TEXT,
    "photoMime" TEXT,
    "photoBlobUrl" TEXT,
    "photoBytes" BYTEA,
    "checkedBy" TEXT NOT NULL,
    "checkedAt" TIMESTAMP(3) NOT NULL,
    "retailerUrl" TEXT,
    "source" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ListingCheck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccreditedBody" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "accreditationNo" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'SYNTHETIC',
    "sourceName" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "lastVerifiedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccreditedBody_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductCertification" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "certificateNumber" TEXT NOT NULL,
    "certificateType" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "bodyId" TEXT,
    "source" TEXT NOT NULL DEFAULT 'SYNTHETIC',
    "sourceName" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "lastVerifiedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductCertification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Scan" (
    "id" TEXT NOT NULL,
    "userKey" TEXT NOT NULL,
    "imagePath" TEXT,
    "imageMime" TEXT,
    "imageBlobUrl" TEXT,
    "imageBytes" BYTEA,
    "status" TEXT NOT NULL,
    "matchSource" TEXT,
    "candidatesJson" TEXT,
    "mode" TEXT NOT NULL,
    "identificationJson" TEXT NOT NULL,
    "productId" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Scan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthAnalysis" (
    "id" TEXT NOT NULL,
    "scanId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "verdict" TEXT NOT NULL,
    "verdictJson" TEXT NOT NULL,
    "checksJson" TEXT NOT NULL,
    "unknownsJson" TEXT NOT NULL,
    "notesJson" TEXT NOT NULL DEFAULT '[]',
    "model" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HealthAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateLimit" (
    "id" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RateLimit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MissingProduct" (
    "id" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "brand" TEXT,
    "sizeLabel" TEXT,
    "category" TEXT NOT NULL,
    "subcategory" TEXT,
    "visibleText" TEXT,
    "lastScanId" TEXT,
    "timesSeen" INTEGER NOT NULL DEFAULT 1,
    "firstSeen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeen" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MissingProduct_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Product_slug_key" ON "Product"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Product_barcode_key" ON "Product"("barcode");

-- CreateIndex
CREATE INDEX "Product_category_idx" ON "Product"("category");

-- CreateIndex
CREATE INDEX "Product_category_subcategory_idx" ON "Product"("category", "subcategory");

-- CreateIndex
CREATE INDEX "Product_slug_idx" ON "Product"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Retailer_slug_key" ON "Retailer"("slug");

-- CreateIndex
CREATE INDEX "ProductListing_productId_idx" ON "ProductListing"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductListing_productId_retailerId_sizeLabel_key" ON "ProductListing"("productId", "retailerId", "sizeLabel");

-- CreateIndex
CREATE INDEX "ListingCheck_listingId_checkedAt_idx" ON "ListingCheck"("listingId", "checkedAt");

-- CreateIndex
CREATE INDEX "ListingCheck_checkedAt_idx" ON "ListingCheck"("checkedAt");

-- CreateIndex
CREATE UNIQUE INDEX "AccreditedBody_slug_key" ON "AccreditedBody"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "ProductCertification_certificateNumber_key" ON "ProductCertification"("certificateNumber");

-- CreateIndex
CREATE INDEX "ProductCertification_productId_idx" ON "ProductCertification"("productId");

-- CreateIndex
CREATE INDEX "Scan_userKey_createdAt_idx" ON "Scan"("userKey", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "HealthAnalysis_scanId_key" ON "HealthAnalysis"("scanId");

-- CreateIndex
CREATE INDEX "RateLimit_windowStart_idx" ON "RateLimit"("windowStart");

-- CreateIndex
CREATE UNIQUE INDEX "MissingProduct_fingerprint_key" ON "MissingProduct"("fingerprint");

-- CreateIndex
CREATE INDEX "MissingProduct_lastSeen_idx" ON "MissingProduct"("lastSeen");

-- AddForeignKey
ALTER TABLE "ProductListing" ADD CONSTRAINT "ProductListing_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductListing" ADD CONSTRAINT "ProductListing_retailerId_fkey" FOREIGN KEY ("retailerId") REFERENCES "Retailer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListingCheck" ADD CONSTRAINT "ListingCheck_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "ProductListing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductCertification" ADD CONSTRAINT "ProductCertification_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductCertification" ADD CONSTRAINT "ProductCertification_bodyId_fkey" FOREIGN KEY ("bodyId") REFERENCES "AccreditedBody"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Scan" ADD CONSTRAINT "Scan_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthAnalysis" ADD CONSTRAINT "HealthAnalysis_scanId_fkey" FOREIGN KEY ("scanId") REFERENCES "Scan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthAnalysis" ADD CONSTRAINT "HealthAnalysis_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

