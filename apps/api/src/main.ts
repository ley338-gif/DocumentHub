import "reflect-metadata";
import "./common/bigint-json-patch";
import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import helmetLikeHeaders from "./common/security-headers.middleware";
import { AppModule } from "./app.module";
import { AllExceptionsFilter } from "./common/errors/all-exceptions.filter";
import { GLOBAL_PREFIX, GLOBAL_PREFIX_EXCLUDES } from "./common/global-prefix";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { cors: true });

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

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
}

bootstrap();
