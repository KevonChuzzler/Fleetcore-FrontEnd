import React, { useState } from 'react';
import DispatchRoutingView from './components/views/DispatchRoutingView';
import LiveMapView from './components/views/LiveMapView';
import { Sparkles, Map, Truck, Package } from 'lucide-react';

export default function App() {
  const [currentView, setCurrentView] = useState<'dispatch' | 'map'>('dispatch');

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      {/* Top Application Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-2xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            
            {/* Brand Logo & Title */}
            <div className="flex items-center gap-3">
              <a href="#" className="flex items-center gap-3 group">
                <div className="h-10 px-2.5 py-1 rounded-xl bg-white border border-slate-200/80 shadow-2xs flex items-center justify-center">
                  <img src="/fleet-logo.svg" alt="FleetCore Logo" className="h-7 w-auto object-contain" />
                </div>
                <div className="hidden sm:block">
                  <div className="text-sm font-bold text-slate-900 leading-tight">FleetCore Dispatch</div>
                  <div className="text-[11px] text-slate-500 leading-tight">Java Backend &middot; OSRM GIS Routing</div>
                </div>
              </a>
            </div>

            {/* Navigation Tabs (Single-line, unboxed, anti-slop) */}
            <nav className="flex items-center gap-1 sm:gap-2">
              <button
                onClick={() => setCurrentView('dispatch')}
                className={`px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors flex items-center gap-2 ${
                  currentView === 'dispatch'
                    ? 'bg-slate-900 text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Dispatch &amp; Optimization</span>
              </button>

              <button
                onClick={() => setCurrentView('map')}
                className={`px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors flex items-center gap-2 ${
                  currentView === 'map'
                    ? 'bg-slate-900 text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <Map className="w-3.5 h-3.5" />
                <span>Live GIS Route Map</span>
              </button>
            </nav>

            {/* Right Status */}
            <div className="hidden md:flex items-center gap-2 text-xs">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 font-mono text-[11px]">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Depot: -25.4753, 30.9694
              </span>
            </div>

          </div>
        </div>
      </header>

      {/* Main View Render */}
      <div className="flex-1">
        {currentView === 'dispatch' ? (
          <DispatchRoutingView />
        ) : (
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 h-[calc(100vh-5rem)]">
            <LiveMapView />
          </div>
        )}
      </div>
    </div>
  );
}
