import "reflect-metadata";
import "./common/bigint-json-patch";
import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import helmetLikeHeaders from "./common/security-headers.middleware";
import { AppModule } from "./app.module";
import { AllExceptionsFilter } from "./common/errors/all-exceptions.filter";
import { GLOBAL_PREFIX, GLOBAL_PREFIX_EXCLUDES } from "./common/global-prefix";
import { validateProductionConfig } from "./common/validate-production-config";
import { corsOptions } from "./common/cors-options";

async function bootstrap() {
  validateProductionConfig();

  const app = await NestFactory.create(AppModule, { cors: corsOptions() });

  // Only trust X-Forwarded-* headers (client IP, protocol) when explicitly
  // told to — spec §42's "keine Blind-Trust-Konfiguration". TRUST_PROXY is
  // the number of hops (reverse proxies) in front of this process to trust;
  // "0"/unset means none (the raw socket's own address is used, correct
  // for local dev and any deployment without a reverse proxy in front).
  // A real production deployment behind one reverse proxy sets TRUST_PROXY=1.
  const trustProxy = Number.parseInt(process.env.TRUST_PROXY ?? "0", 10);
  if (trustProxy > 0) {
    app.getHttpAdapter().getInstance().set("trust proxy", trustProxy);
  }

  app.use(helmetLikeHeaders);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
  app.setGlobalPrefix(GLOBAL_PREFIX, { exclude: GLOBAL_PREFIX_EXCLUDES });

  // Spec §46 — on SIGTERM (how Docker/orchestrators ask a container to
  // stop), let in-flight requests finish and close the Prisma connection
  // cleanly instead of the process being killed mid-request.
  app.enableShutdownHooks();

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`Document Hub API v${process.env.npm_package_version ?? "0.1.0-rc.1"} listening on port ${port}`);
}

bootstrap();
