import type {Metadata,Viewport} from "next";
import "./globals.css";
export const metadata: Metadata = {title:"Lampey Lights Studio",description:"3D Christmas light design and Light-O-Rama patch planning.",icons:{icon:"/favicon.svg"}};
export const viewport: Viewport = {width:"device-width",initialScale:1,viewportFit:"cover",themeColor:"#060a13"};
export default function RootLayout({children}:{children:React.ReactNode}) {return <html lang="en"><body>{children}</body></html>}
