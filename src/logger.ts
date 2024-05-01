import pino from "pino";
import config from "./config";

export const logger = pino({
  level: config.logLevel,
  transport: {
    targets: [
      {
        target: 'pino-pretty',
        level: 'trace',
        options: {
          destination: './debug.log'
        }
      },
      {
        target: 'pino-pretty',
        level: 'info',
        options: {
          destination: './info.log'
        }
      },
      {
        target: 'pino-pretty',
        level: 'info',
        options: {
          destination: 1
        }
      }
    ]

  },
  base: {
    name: 'default'
  },
});
