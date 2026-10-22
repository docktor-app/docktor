import {z} from "zod";

/** RED stub: accepts any object with a string type; replaced in the GREEN commit. */
export const stateEventSchema = z.looseObject({type: z.string()});
export const STATE_EVENT_TYPES = [] as const;
