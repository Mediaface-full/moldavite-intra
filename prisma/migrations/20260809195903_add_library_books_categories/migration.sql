-- CreateTable
CREATE TABLE "BookCategory" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BookCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Book" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "storageFilename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "categoryId" INTEGER,
    "uploadedById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Book_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BookCategory_name_key" ON "BookCategory"("name");

-- CreateIndex
CREATE INDEX "BookCategory_sortOrder_idx" ON "BookCategory"("sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "Book_storageFilename_key" ON "Book"("storageFilename");

-- CreateIndex
CREATE INDEX "Book_categoryId_idx" ON "Book"("categoryId");

-- CreateIndex
CREATE INDEX "Book_createdAt_idx" ON "Book"("createdAt");

-- AddForeignKey
ALTER TABLE "Book" ADD CONSTRAINT "Book_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "BookCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;
