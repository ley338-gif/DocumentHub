import "reflect-metadata";
import "./common/bigint-json-patch";
import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import helmetLikeHeaders from "./common/security-headers.middleware";
import { AppModule } from "./app.module";
import { AllExceptionsFilter } from "./common/errors/all-exceptions.filter";

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
  app.setGlobalPrefix("api", { exclude: ["health", "p/:stableId", "u/:stableId"] });

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
}

bootstrap();
