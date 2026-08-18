import { Injectable } from "@nestjs/common";
import * as fs from "fs";
import * as fsp from "fs/promises";
import * as path from "path";
import { StorageService } from "./storage.service";
import { AppError } from "../common/errors/app-error";

@Injectable()
export class LocalFilesystemStorageService implements StorageService {
  private readonly root: string;

  constructor() {
    this.root = path.resolve(process.env.STORAGE_LOCAL_ROOT ?? "./storage");
    if (!fs.existsSync(this.root)) {
      fs.mkdirSync(this.root, { recursive: true });
    }
  }

  // Resolves `key` against the storage root and refuses anything that would
  // escape it — this is the only line of defense against a malicious or
  // buggy caller passing an unsanitized key (e.g. containing "..").
  private resolvePath(key: string): string {
    if (key.includes("\0") || key.includes("..")) {
      throw new AppError("VALIDATION_ERROR", "Invalid storage key");
    }
    const resolved = path.resolve(this.root, key);
    const relative = path.relative(this.root, resolved);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      throw new AppError("VALIDATION_ERROR", "Storage key resolves outside storage root");
    }
    return resolved;
  }

  async put(key: string, buffer: Buffer, _contentType: string): Promise<void> {
    const target = this.resolvePath(key);
    await fsp.mkdir(path.dirname(target), { recursive: true });
    await fsp.writeFile(target, buffer);
  }

  async get(key: string): Promise<Buffer> {
    const target = this.resolvePath(key);
    return fsp.readFile(target);
  }

  async exists(key: string): Promise<boolean> {
    const target = this.resolvePath(key);
    try {
      await fsp.access(target);
      return true;
    } catch {
      return false;
    }
  }
}
