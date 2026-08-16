import React, { useState } from 'react';
import { Share2, Copy, Link as LinkIcon, X, MessageCircle, Check } from 'lucide-react';
import { createShare } from '@/lib/store';

export default function ShareDialog({ open, onClose, data, directUrl, title = 'share' }) {
  const [shareId, setShareId] = useState(null);
  const [copied, setCopied] = useState(false);

  React.useEffect(() => {
    if (open && data && !shareId && !directUrl) {
      const id = createShare(data);
      setShareId(id);
    }
    if (!open) {
      setShareId(null);
      setCopied(false);
    }
  }, [open, data, shareId, directUrl]);

  if (!open) return null;

  const shareUrl = directUrl || (shareId ? `${window.location.origin}/s/${shareId}` : '');

  const handleCopy = () => {
    navigator.clipboard?.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleNativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: data?.name || 'retrolist', url: shareUrl });
      } catch {}
    } else {
      handleCopy();
    }
  };

  const socialLinks = [
    { label: 'whatsapp', url: shareUrl ? `https://wa.me/?text=${encodeURIComponent(shareUrl)}` : '#', icon: MessageCircle },
    { label: 'twitter', url: shareUrl ? `https://twitter.com/intent/tweet?url=${encodeURIComponent(shareUrl)}` : '#', icon: Share2 },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-background/60 backdrop-blur-sm animate-fade-in" />
      <div
        className="relative w-full max-w-lg bg-card rounded-t-3xl sm:rounded-3xl border border-border p-5 pb-8 animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold lowercase">{title}</h3>
          <button onClick={onClose} className="touch-44 p-1 rounded-full">
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        <p className="text-xs text-muted-foreground mb-3 lowercase">share link</p>
        <div className="flex items-center gap-2 mb-4">
          <div className="flex-1 px-3 py-2.5 rounded-xl bg-muted text-xs text-muted-foreground truncate selectable">
            {shareUrl || 'generating...'}
          </div>
          <button
            onClick={handleCopy}
            className="touch-44 px-4 h-11 rounded-xl bg-foreground text-background text-sm font-medium lowercase flex items-center gap-1.5"
          >
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            {copied ? 'copied' : 'copy'}
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-3">
          {socialLinks.map(({ label, url, icon: Icon }) => (
            <a
              key={label}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="touch-44 flex items-center justify-center gap-2 py-3 rounded-xl bg-muted text-sm font-medium lowercase"
            >
              <Icon className="w-4 h-4" />
              {label}
            </a>
          ))}
        </div>

        <button
          onClick={handleNativeShare}
          className="touch-44 w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-foreground text-background text-sm font-medium lowercase"
        >
          <Share2 className="w-4 h-4" />
          share via apps
        </button>
      </div>
    </div>
  );
}