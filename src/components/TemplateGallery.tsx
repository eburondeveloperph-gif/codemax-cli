"use client";

import { useState } from "react";
import { Smartphone, ArrowRight, Layers, X } from "lucide-react";

export interface Template {
  id: string;
  name: string;
  description: string;
  category: string;
  color: string;
  previewUrl: string;
  pages: { label: string; url: string }[];
}

const TEMPLATES: Template[] = [
  {
    id: "affan",
    name: "Affan",
    description: "Clean mobile PWA template with modern login/register flows, hero blocks, and minimal UI. Great for social apps, portfolios, and lightweight mobile-first projects.",
    category: "Mobile PWA",
    color: "from-blue-500 to-cyan-500",
    previewUrl: "/templates/affan/home.html",
    pages: [
      { label: "Home", url: "/templates/affan/home.html" },
      { label: "Login", url: "/templates/affan/login.html" },
      { label: "Register", url: "/templates/affan/register.html" },
      { label: "Hero Blocks", url: "/templates/affan/hero-blocks.html" },
      { label: "Forgot Password", url: "/templates/affan/forget-password.html" },
    ],
  },
  {
    id: "mpay",
    name: "mPay",
    description: "Dark-themed fintech payment app with AOS animations, swiper carousels, and glassmorphism cards. Perfect for banking, crypto wallets, and payment platforms.",
    category: "Fintech",
    color: "from-emerald-500 to-teal-600",
    previewUrl: "/templates/mpay/index.html",
    pages: [
      { label: "Dashboard", url: "/templates/mpay/index.html" },
      { label: "Sign In", url: "/templates/mpay/signin.html" },
      { label: "Sign Up", url: "/templates/mpay/signup.html" },
    ],
  },
  {
    id: "multikart",
    name: "Multikart",
    description: "Full-featured e-commerce PWA with product catalog, cart, categories, order history, and profile. Includes sliders, icon fonts, and mobile bottom tab navigation.",
    category: "E-Commerce",
    color: "from-orange-500 to-red-500",
    previewUrl: "/templates/multikart/index.html",
    pages: [
      { label: "Home", url: "/templates/multikart/index.html" },
      { label: "Product", url: "/templates/multikart/product.html" },
      { label: "Category", url: "/templates/multikart/category.html" },
      { label: "Cart", url: "/templates/multikart/cart.html" },
      { label: "Profile", url: "/templates/multikart/profile.html" },
      { label: "Orders", url: "/templates/multikart/order-history.html" },
    ],
  },
  {
    id: "learning",
    name: "LearningUIUX",
    description: "Education platform with gradient backgrounds, personalization flows, and course dashboard. Ideal for e-learning, course platforms, and training apps.",
    category: "Education",
    color: "from-purple-500 to-pink-500",
    previewUrl: "/templates/learning/learning-dashboard.html",
    pages: [
      { label: "Dashboard", url: "/templates/learning/learning-dashboard.html" },
      { label: "Login", url: "/templates/learning/learning-login.html" },
      { label: "Sign Up", url: "/templates/learning/learning-signup.html" },
      { label: "Personalize", url: "/templates/learning/learning-personalization.html" },
      { label: "Forgot Password", url: "/templates/learning/learning-forgot-password.html" },
    ],
  },
];

interface Props {
  onUseTemplate: (prompt: string) => void;
}

export default function TemplateGallery({ onUseTemplate }: Props) {
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [activePage, setActivePage] = useState(0);

  if (selectedTemplate) {
    return (
      <TemplatePreview
        template={selectedTemplate}
        activePage={activePage}
        onPageChange={setActivePage}
        onBack={() => { setSelectedTemplate(null); setActivePage(0); }}
        onUse={() => {
          onUseTemplate(`Create a ${selectedTemplate.category.toLowerCase()} app similar to ${selectedTemplate.name} — ${selectedTemplate.description}`);
          setSelectedTemplate(null);
          setActivePage(0);
        }}
      />
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-white/[0.06]">
        <div className="flex items-center gap-2">
          <Layers size={14} className="text-eburon-400" />
          <span className="text-xs font-semibold text-white">Templates</span>
        </div>
        <p className="text-[10px] text-gray-500 mt-1">Tap a template to preview & use as a starting point</p>
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
        {TEMPLATES.map((t) => (
          <button
            key={t.id}
            onClick={() => setSelectedTemplate(t)}
            className="w-full group text-left rounded-xl bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.06] hover:border-white/[0.12] p-3 transition-all"
          >
            <div className="flex items-start gap-3">
              <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${t.color} flex items-center justify-center shrink-0`}>
                <Smartphone size={16} className="text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[12px] font-semibold text-white group-hover:text-eburon-300 transition-colors">{t.name}</span>
                  <span className="px-1.5 py-0.5 rounded-md bg-white/[0.06] text-[9px] font-medium text-gray-500 uppercase tracking-wider">{t.category}</span>
                </div>
                <p className="text-[10px] text-gray-500 mt-1 line-clamp-2 leading-relaxed">{t.description}</p>
                <div className="flex items-center gap-1 mt-2 text-[9px] text-gray-600">
                  <span>{t.pages.length} pages</span>
                  <span>·</span>
                  <span className="text-eburon-400 group-hover:text-eburon-300 flex items-center gap-0.5">
                    Preview <ArrowRight size={8} />
                  </span>
                </div>
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function TemplatePreview({
  template, activePage, onPageChange, onBack, onUse,
}: {
  template: Template;
  activePage: number;
  onPageChange: (i: number) => void;
  onBack: () => void;
  onUse: () => void;
}) {
  const page = template.pages[activePage];

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-white/[0.06] flex items-center gap-2">
        <button onClick={onBack} className="w-6 h-6 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] flex items-center justify-center text-gray-400 hover:text-white transition-colors">
          <X size={12} />
        </button>
        <div className={`w-6 h-6 rounded-md bg-gradient-to-br ${template.color} flex items-center justify-center`}>
          <Smartphone size={10} className="text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <span className="text-xs font-semibold text-white">{template.name}</span>
          <span className="text-[10px] text-gray-500 ml-2">{template.category}</span>
        </div>
      </div>

      {/* Page tabs */}
      <div className="px-3 py-2 border-b border-white/[0.04] overflow-x-auto flex gap-1 no-scrollbar">
        {template.pages.map((p, i) => (
          <button
            key={p.label}
            onClick={() => onPageChange(i)}
            className={`shrink-0 px-2.5 py-1 rounded-lg text-[10px] font-medium transition-all ${
              i === activePage
                ? "bg-eburon-600/20 text-eburon-300 border border-eburon-500/30"
                : "text-gray-500 hover:text-gray-300 hover:bg-white/[0.04] border border-transparent"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* iPhone mockup */}
      <div className="flex-1 flex flex-col items-center justify-center p-4 overflow-hidden">
        <div className="relative w-[260px] max-h-full">
          {/* Phone frame */}
          <div className="relative bg-[#1a1a1a] rounded-[2.5rem] p-2 shadow-2xl shadow-black/50 border border-white/[0.08]">
            {/* Notch */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-28 h-5 bg-[#1a1a1a] rounded-b-2xl z-10 flex items-center justify-center">
              <div className="w-12 h-3 bg-[#0d0d0d] rounded-full" />
            </div>
            {/* Screen */}
            <div className="rounded-[2rem] overflow-hidden bg-white" style={{ aspectRatio: "9/19.5" }}>
              <iframe
                src={page.url}
                title={`${template.name} — ${page.label}`}
                className="w-[375px] h-[812px] border-0 origin-top-left"
                style={{ transform: "scale(0.656)", transformOrigin: "top left" }}
                sandbox="allow-scripts allow-same-origin"
              />
            </div>
            {/* Home indicator */}
            <div className="flex justify-center py-1.5">
              <div className="w-24 h-1 rounded-full bg-white/20" />
            </div>
          </div>
        </div>
      </div>

      {/* Description + Use button */}
      <div className="px-4 py-3 border-t border-white/[0.06] space-y-2">
        <p className="text-[10px] text-gray-500 leading-relaxed">{template.description}</p>
        <button
          onClick={onUse}
          className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-eburon-600 to-purple-600 hover:from-eburon-500 hover:to-purple-500 text-white text-xs font-semibold transition-all shadow-lg shadow-eburon-600/20"
        >
          Use This Template <ArrowRight size={12} />
        </button>
      </div>
    </div>
  );
}
