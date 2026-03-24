import { Link } from "wouter";
import { Home } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background text-foreground relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-primary/5 to-transparent opacity-50 pointer-events-none" />
      
      <div className="glass-panel max-w-md w-full p-8 rounded-3xl text-center relative z-10 mx-4">
        <h1 className="text-8xl font-display font-bold text-transparent bg-clip-text bg-gradient-to-b from-white to-white/20 mb-4">
          404
        </h1>
        <h2 className="text-2xl font-semibold mb-2">Track Not Found</h2>
        <p className="text-white/50 mb-8">
          The soundtrack or page you're looking for has been removed, or it never existed in the first place.
        </p>
        
        <Link href="/" className="inline-flex items-center justify-center gap-2 w-full h-12 rounded-xl bg-white text-black font-semibold hover:bg-white/90 transition-colors">
          <Home className="w-5 h-5" />
          Back to Studio
        </Link>
      </div>
    </div>
  );
}
