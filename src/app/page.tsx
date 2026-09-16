import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";

export default async function Home() {
  const user = await getUser();
  redirect(user?.role === "STUDENT" ? "/dashboard" : user?.role === "ADMIN" ? "/admin" : "/schedule");
}
