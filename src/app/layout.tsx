import type { Metadata } from "next";
import "./dashboard.css";

export const metadata: Metadata = { title: "Radar de Clientes", description: "Pesquisa local auditável de oportunidades públicas" };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="pt-BR"><body>{children}</body></html>; }
