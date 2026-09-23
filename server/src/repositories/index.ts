// Single source of repository singletons for the whole composition root
// (D-09). Every repository class in this directory publishes exactly one
// instance here — either by re-exporting a singleton the repository's own
// module already exports, or (for repositories that had none) by adding
// one to that module and re-exporting it. No repository is constructed a
// second time in this file; `repositories/index.test.ts` asserts reference
// identity to catch a regression.

export {stackRepository} from "./stack-repository.js";
export {stackEventRepository} from "./stack-event-repository.js";
export {settingsRepository} from "./settings-repository.js";
export {notificationRepository} from "./notification-repository.js";
export {backupRepository} from "./backup-repository.js";
export {proxyRepository} from "./proxy-repository.js";
export {certificateRepository} from "./certificate-repository.js";
export {imageUpdateCheckRepository} from "./image-update-check-repository.js";
export {userRepository} from "./user-repository.js";
