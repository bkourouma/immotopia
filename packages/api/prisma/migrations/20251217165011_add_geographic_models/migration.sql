-- CreateTable
CREATE TABLE "countries" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "name_fr" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "countries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "regions" (
    "id" TEXT NOT NULL,
    "country_id" TEXT NOT NULL,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "name_fr" TEXT,
    "capital" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "regions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "communes" (
    "id" TEXT NOT NULL,
    "region_id" TEXT NOT NULL,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "name_fr" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "communes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "countries_code_key" ON "countries"("code");

-- CreateIndex
CREATE INDEX "countries_code_idx" ON "countries"("code");

-- CreateIndex
CREATE INDEX "countries_is_active_idx" ON "countries"("is_active");

-- CreateIndex
CREATE INDEX "regions_country_id_idx" ON "regions"("country_id");

-- CreateIndex
CREATE INDEX "regions_code_idx" ON "regions"("code");

-- CreateIndex
CREATE INDEX "regions_is_active_idx" ON "regions"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "regions_country_id_name_key" ON "regions"("country_id", "name");

-- CreateIndex
CREATE INDEX "communes_region_id_idx" ON "communes"("region_id");

-- CreateIndex
CREATE INDEX "communes_code_idx" ON "communes"("code");

-- CreateIndex
CREATE INDEX "communes_is_active_idx" ON "communes"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "communes_region_id_name_key" ON "communes"("region_id", "name");

-- AddForeignKey
ALTER TABLE "regions" ADD CONSTRAINT "regions_country_id_fkey" FOREIGN KEY ("country_id") REFERENCES "countries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communes" ADD CONSTRAINT "communes_region_id_fkey" FOREIGN KEY ("region_id") REFERENCES "regions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
