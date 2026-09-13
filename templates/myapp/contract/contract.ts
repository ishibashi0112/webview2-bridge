import { z } from "zod";
import { defineContract } from "@ishibashi0112/webview2-bridge-gen";
const Customer = z.object({ id: z.string(), name: z.string() }).meta({ id: "Customer" });
export const contract = defineContract({
  methods: { customers: { list: { input: z.object({ keyword: z.string().optional() }), output: z.object({ items: z.array(Customer) }) } } },
  events: { progress: z.object({ percent: z.number() }) },
});
export type Contract = typeof contract;
