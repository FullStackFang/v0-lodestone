"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "@/db/client";
import { requirePerson } from "@/lib/session";
import { measurementDecision, withdrawMeasurement } from "@/pilot/measurement";

export type MeasurementState = { message?: string; error?: string };
export async function decideMeasurement(_state: MeasurementState, form: FormData): Promise<MeasurementState> {
  try {
    const db = await getDb();
    const person = await requirePerson(db);
    await measurementDecision(db, person.id, {
      consent: z.enum(["yes", "no"]).parse(form.get("decision")) === "yes",
      noticeVersion: "measurement-v1",
    });
    revalidatePath("/pilot/measurement");
    return { message: "Your measurement choice was saved." };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Your choice could not be saved." };
  }
}

export async function withdrawMeasurementConsent(): Promise<MeasurementState> {
  const db = await getDb();
  const person = await requirePerson(db);
  await withdrawMeasurement(db, person.id);
  revalidatePath("/pilot/measurement");
  return { message: "Measurement consent withdrawn and daily activity deleted." };
}
