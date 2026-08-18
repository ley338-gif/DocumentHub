import { Module } from "@nestjs/common";
import { STORAGE_SERVICE } from "./storage.service";
import { LocalFilesystemStorageService } from "./local-filesystem-storage.service";
import { S3StorageService } from "./s3-storage.service";

@Module({
  providers: [
    {
      provide: STORAGE_SERVICE,
      useFactory: () => {
        const driver = process.env.STORAGE_DRIVER ?? "local";
        return driver === "s3" ? new S3StorageService() : new LocalFilesystemStorageService();
      },
    },
  ],
  exports: [STORAGE_SERVICE],
})
export class StorageModule {}
