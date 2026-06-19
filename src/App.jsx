
    import React, { useState, useEffect, useRef, useMemo, useCallback, memo } from 'react';
import {
  SERVICE_CHARGE_RATE,
  ADMIN_PIN_HASH,
  hashPIN,
  DAILY_SPECIALS,
  INCLUDED_SIGNATURE_NAMES,
  subCategoryMap,
  catMap,
  INITIAL_CATEGORIES,
  PAIRING_MATRIX,
  RAW_MENU,
  getExactImage,
  isSignature,
  isVeg,
  inferPrepTime,
  prepTimeMinutes,
  prepTimeNum,
  inferFlavorProfile,
  generateSensoryHook,
  INITIAL_STATIC_MENU
} from './constants/menu';
import { __db, __storage, __auth, __sessionId } from './firebase';

const haptic = (type) => {
      const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (prefersReducedMotion || !navigator.vibrate) return;
      try {
        if (type === 'light') navigator.vibrate(5);
        if (type === 'medium') navigator.vibrate(15);
        if (type === 'success') navigator.vibrate([10, 50, 20]);
        if (type === 'error') navigator.vibrate([30, 30, 30, 30]);
      } catch(e) {}
    };

    const showToast = (message, type = 'success') => {
      const t = document.createElement('div');
      const isSuccess = type === 'success';
      t.className = `fixed top-0 left-1/2 -translate-x-1/2 px-6 py-3 mt-4 z-[20000] flex items-center gap-2 animate-fade-veil text-sm font-medium`;
      t.style.cssText = `
        margin-top: max(1rem, env(safe-area-inset-top));
        border-radius: var(--r-btn);
        box-shadow: var(--sh-float);
        ${isSuccess ? `
          background: rgba(28,18,8,0.92);
          backdrop-filter: blur(12px);
          border: 1px solid rgba(160, 120, 90,0.15);
          color: rgba(255,255,255,0.92);
        ` : `
          background: var(--error-bg);
          border: 1px solid var(--error-border);
          color: var(--error-text);
        `}
      `;
      t.setAttribute('role', 'alert');
      t.setAttribute('aria-live', 'assertive');
      
      const iconWrap = document.createElement('span');
      iconWrap.setAttribute('aria-hidden', 'true');
      iconWrap.innerHTML = isSuccess 
        ? `<svg viewBox="0 0 24 24" fill="none" class="w-4 h-4" stroke="#5DB075" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>` 
        : `<svg viewBox="0 0 24 24" fill="none" class="w-4 h-4" stroke="#A84232" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>`;
      
      const text = document.createElement('span');
      text.style.transform = 'translateY(1px)';
      text.textContent = String(message);
      
      t.append(iconWrap, text);
      document.body.appendChild(t);
      
      setTimeout(() => { 
        t.style.opacity = '0'; 
        t.style.transform = 'translate(-50%, -12px)'; 
        t.style.transition = 'opacity 200ms, transform 200ms';
        setTimeout(()=>t.remove(), 200); 
      }, 3000);
    };

    const fuzzyMatch = (query, str) => {
      const q = query.toLowerCase().replace(/\s+/g,'');
      const s = str.toLowerCase();
      if (s.includes(q)) return 1.0;
      let qi = 0;
      for (let i = 0; i < s.length && qi < q.length; i++) { if (s[i] === q[qi]) qi++; }
      return qi === q.length ? 0.5 : 0;
    };
    // ─── Hooks ───
    const useSmartContext = () => {
      const [val, setVal] = useState({timeOfDay: 'afternoon', temperature: 28, isLiveWeather: false});
      useEffect(() => {
        const h = new Date().getHours();
        const tod = h < 11 ? 'morning' : h < 16 ? 'afternoon' : 'evening';
        setVal(v => ({ ...v, timeOfDay: tod }));
        fetch('https://wttr.in/Dipayal?format=j1')
          .then(r => r.json())
          .then(d => {
            const temp = parseInt(d.current_condition[0].temp_C);
            const desc = d.current_condition[0].weatherDesc[0].value;
            setVal(v => ({ ...v, temperature: temp, weatherDesc: desc, isLiveWeather: true }));
          })
          .catch(() => {});
      }, []);
      return val;
    };

    const useLoyalty = () => {
      const [stats, setStats] = useState({ visits: 0, spend: 0 });
      useEffect(() => {
        try {
          const local = JSON.parse(localStorage.getItem('satkar_loyalty'));
          if (local) setStats(local);
        } catch(e) {}
      }, []);
      const addOrder = (total) => {
        setStats(p => {
          const n = { visits: p.visits + 1, spend: p.spend + total };
          localStorage.setItem('satkar_loyalty', JSON.stringify(n));
          return n;
        });
      };
      return { ...stats, isRegular: stats.visits >= 5, addOrder };
    };

    const useRecentlyViewed = (menuData) => {
      const [recentIds, setRecentIds] = useState([]);
      useEffect(() => {
        try {
          const local = JSON.parse(localStorage.getItem('satkar_recent'));
          if (local) setRecentIds(local);
        } catch(e) {}
      }, []);
      const recent = useMemo(() => menuData.filter(m => recentIds.includes(m.id)), [recentIds, menuData]);
      const addRecent = (item) => {
        setRecentIds(prev => {
          const np = [item.id, ...prev].filter((v,i,a)=>a.indexOf(v)===i).slice(0,6);
          localStorage.setItem('satkar_recent', JSON.stringify(np));
          return np;
        });
      };
      return { recent, addRecent };
    };

    const useBottomSheet = (isOpen, onClose, sheetRef) => {
      const yStr = useRef(0);
      const onCloseRef = useRef(onClose);
      useEffect(() => { onCloseRef.current = onClose; }, [onClose]);
      useEffect(() => {
        if (!isOpen) return;
        const el = sheetRef.current;
        if (!el) return;
        
        let startY = 0; let currentY = 0; let touching = false;
        const onStart = e => { if (e.target.closest('.scrollable-area')) return; startY = e.touches[0].clientY; touching = true; el.classList.add('dragging'); };
        const onMove = e => { if(!touching) return; currentY = e.touches[0].clientY; const dynY = Math.max(0, currentY - startY); el.style.transform = `translateY(${dynY}px)`; };
        const onEnd = e => {
          if(!touching) return; touching = false; el.classList.remove('dragging');
          if (currentY - startY > 100) { el.style.transform = `translateY(100%)`; setTimeout(() => onCloseRef.current(), 250); }
          else { el.style.transform = `translateY(0)`; }
        };
        
        el.addEventListener('touchstart', onStart, {passive:true});
        el.addEventListener('touchmove', onMove, {passive:true});
        el.addEventListener('touchend', onEnd);
        return () => { el.removeEventListener('touchstart', onStart); el.removeEventListener('touchmove', onMove); el.removeEventListener('touchend', onEnd); };
      }, [isOpen]);
    };

    const useOrderStatus = (orderId, onClose) => {
      const [order, setOrder] = useState(null);
      const [error, setError] = useState(false);
      const notifiedRef = useRef({ ready: false });

      // Reset notification flag when orderId changes
      useEffect(() => {
        notifiedRef.current = { ready: false };
      }, [orderId]);

      // Auto-close when status is 'done'
      useEffect(() => {
        if (order?.status === 'done' && onClose) {
          const t = setTimeout(() => onClose(), 2000);
          return () => clearTimeout(t);
        }
      }, [order?.status, onClose]);

      useEffect(() => {
        if (!orderId) return;
        setError(false);
        
        const unsub = __db.collection('orders').doc(orderId).onSnapshot(
          snap => {
            if (snap.exists) {
              const data = snap.data();
              setOrder(data);
              
              // Trigger notification when status becomes 'ready' (once)
              if (data.status === 'ready' && !notifiedRef.current.ready) {
                notifiedRef.current.ready = true;
                haptic('success');
                showToast("Your order is ready!", 'success');
              }
            } else {
              setOrder(null);
            }
          },
          err => {
            console.error('Order status error:', err);
            setError(true);
          }
        );

        return () => unsub();
      }, [orderId]);

      return { order, error, itemCount: order?.items?.length || 0 };
    };

    const useCart = () => {
      const [cart, setCart] = useState([]);
      const [initialized, setInitialized] = useState(false);
      
      useEffect(() => {
        try {
          const local = JSON.parse(localStorage.getItem('satkar_cart'));
          if (local) setCart(local);
        } catch(e) {}
        setInitialized(true);
      }, []);

      const cartDebounceRef = useRef(null);
      useEffect(() => {
        if (!initialized) return;
        if (cartDebounceRef.current) clearTimeout(cartDebounceRef.current);
        cartDebounceRef.current = setTimeout(() => {
          localStorage.setItem('satkar_cart', JSON.stringify(cart));
        }, 500);
        return () => { if (cartDebounceRef.current) clearTimeout(cartDebounceRef.current); };
      }, [cart, initialized]);
      
      const addToCart = (item, qty, e) => {
        haptic('medium');
        if (e && e.target) {
          try {
            const rect = e.target.getBoundingClientRect();
            const cloneNode = document.createElement('img');
            cloneNode.src = item.imageUrl; cloneNode.className = 'fly-clone';
            cloneNode.style.width = '60px'; cloneNode.style.height = '60px';
            cloneNode.style.top = rect.top + 'px'; cloneNode.style.left = rect.left + 'px';
            const dx = window.innerWidth / 2 - rect.left - 30; const dy = window.innerHeight - 40 - rect.top;
            cloneNode.style.setProperty('--dx', dx + 'px'); cloneNode.style.setProperty('--dy', dy + 'px');
            document.body.appendChild(cloneNode);
            setTimeout(() => cloneNode.remove(), 700);
          } catch(e) {}
        }
        setCart(p => {
          const ex = p.find(c => c.item.id === item.id);
          if (ex) return p.map(c => c.item.id === item.id ? {...c, qty: c.qty + qty} : c);
          return [...p, {item, qty}];
        });
      };
      
      const updateQty = (id, d) => {
        haptic('light');
        setCart(p => p.map(c => c.item.id === id ? {...c, qty: c.qty + d} : c).filter(c => c.qty > 0));
      };
      
      const clearCart = () => setCart([]);
      
      const total = cart.reduce((sum, c) => sum + (c.item.price * c.qty), 0);
      const count = cart.reduce((sum, c) => sum + c.qty, 0);
      
      return { cart, addToCart, updateQty, clearCart, total, count };
    };
    // ─── UI Primitives ───
    const Icons = {
      Coffee: props => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...props}><path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/></svg>,
      Pizza: props => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...props}><path d="M15 11l-5 5"/><path d="M5 10l4.5 4.5"/><path d="M2 11c0 5.5 4.5 10 10 10s10-4.5 10-10c0-5.5-4.5-10-10-10C6.5 1 2 5.5 2 11z"/><path d="M22 11h-4"/><path d="M12 2v4"/><path d="M2 11h4"/><path d="M12 22v-4"/></svg>,
      Utensils: props => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...props}><path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><line x1="7" y1="2" x2="7" y2="15"/><path d="M18 15V2a1 1 0 0 0-1-1h-1a1 1 0 0 0-1 1v13a4 4 0 0 0 8 0v-2"/><line x1="21" y1="2" x2="21" y2="15"/></svg>,
      Flame: props => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...props}><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3 1.07.56 2 1.56 2 3a2.5 2.5 0 0 1-5 0c0-1.5 1.31-3.2 2-4 0 3.33 3 5.33 3 5.33S17 11 17 8.67C17 5.33 13 2 13 2c4 3 6 7 6 9.5a7 7 0 1 1-14 0c0-2 1-4.5 2.5-6C6 8 8.5 11 8.5 14.5z"/></svg>,
      Type: props => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...props}><polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/></svg>,

      Leaf: props => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...props}><path d="M11 20C11 20 1 15 1 8C1 3.5 6 1 11 1C16 1 21 3.5 21 8C21 15 11 20 11 20Z"/><path d="M11 20V12"/></svg>,
      X: props => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...props}><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
      ArrowLeft: props => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...props}><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>,
      ShoppingCart: props => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...props}><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>,
      CheckCircle: props => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...props}><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>,
      Sparkles: props => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...props}><path d="M12 3l1.912 5.813a2 2 0 001.275 1.275L21 12l-5.813 1.912a2 2 0 00-1.275 1.275L12 21l-1.912-5.813a2 2 0 00-1.275-1.275L3 12l5.813-1.912a2 2 0 001.275-1.275L12 3z"/></svg>,
      Search: props => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...props}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
      Send: props => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...props}><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>,
      Filter: props => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...props}><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>,
      ChevronRight: props => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...props}><polyline points="9 18 15 12 9 6"/></svg>,
      ChevronLeft: props => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...props}><polyline points="15 18 9 12 15 6"/></svg>,
      Plus: props => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...props}><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
      Minus: props => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...props}><line x1="5" y1="12" x2="19" y2="12"/></svg>,
      Bell: props => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...props}><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>,
      Glass: props => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...props}><path d="M8 22h8"/><path d="M7 10h10"/><path d="M5 3l2 7h10l2-7z"/><line x1="12" y1="10" x2="12" y2="22"/></svg>,
      Wind: props => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M9.59 4.59A2 2 0 1 1 11 8H2m10.59 11.41A2 2 0 1 0 14 16H2m15.73-8.27A2.5 2.5 0 1 1 19.5 12H2"/></svg>,
      Camera: props => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>,
      Check: props => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...props}><polyline points="20 6 9 17 4 12"/></svg>,
      ShoppingBag: props => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...props}><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>,
      Home: props => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
    };

    // Category styling theme system
    const getCategoryStyles = (catId) => {
      const styles = {
        "Beverages": {
          bg: "linear-gradient(160deg, #FDF9F4 0%, #F5EBE1 100%)",
          border: "1px solid rgba(139, 99, 71, 0.14)",
          iconBg: "linear-gradient(135deg, #FDF6EC 0%, #EADAC9 100%)",
          iconBorder: "1px solid rgba(139, 99, 71, 0.2)",
          iconColor: "#7E593C",
          glow: "rgba(139, 99, 71, 0.08)",
          activePillBg: "linear-gradient(135deg, #7E593C 0%, #523D32 100%)",
          bgImage: "https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=500&q=80",
          glowColor: "#8b6347"
        },
        "Bar": {
          bg: "linear-gradient(160deg, #FAF4F4 0%, #F1E2E1 100%)",
          border: "1px solid rgba(148, 72, 67, 0.14)",
          iconBg: "linear-gradient(135deg, #FDF3F2 0%, #EBD5D4 100%)",
          iconBorder: "1px solid rgba(148, 72, 67, 0.2)",
          iconColor: "#944843",
          glow: "rgba(148, 72, 67, 0.08)",
          activePillBg: "linear-gradient(135deg, #944843 0%, #68302C 100%)",
          bgImage: "https://images.unsplash.com/photo-1514362545857-3bc16c4c7d1b?w=500&q=80",
          glowColor: "#944843"
        },
        "Hookah": {
          bg: "linear-gradient(160deg, #F3F8FA 0%, #E3EDF2 100%)",
          border: "1px solid rgba(43, 108, 133, 0.14)",
          iconBg: "linear-gradient(135deg, #ECF5F9 0%, #D4E4EE 100%)",
          iconBorder: "1px solid rgba(43, 108, 133, 0.2)",
          iconColor: "#2B6C85",
          glow: "rgba(43, 108, 133, 0.08)",
          activePillBg: "linear-gradient(135deg, #2B6C85 0%, #1A4657 100%)",
          bgImage: "https://images.unsplash.com/photo-1568285521742-b9e38d975a6c?w=500&q=80",
          glowColor: "#2b6c85"
        },
        "Main Eats": {
          bg: "linear-gradient(160deg, #FAF4EE 0%, #F4E2D3 100%)",
          border: "1px solid rgba(181, 101, 38, 0.14)",
          iconBg: "linear-gradient(135deg, #FDF4EB 0%, #EDD3BE 100%)",
          iconBorder: "1px solid rgba(181, 101, 38, 0.2)",
          iconColor: "#B56526",
          glow: "rgba(181, 101, 38, 0.08)",
          activePillBg: "linear-gradient(135deg, #B56526 0%, #85491C 100%)",
          bgImage: "https://images.unsplash.com/photo-1513104890138-7c749659a591?w=500&q=80",
          glowColor: "#b56526"
        },
        "Snacks & Starters": {
          bg: "linear-gradient(160deg, #FAF7ED 0%, #F2ECCC 100%)",
          border: "1px solid rgba(153, 127, 43, 0.14)",
          iconBg: "linear-gradient(135deg, #FAF6E3 0%, #EAE0B7 100%)",
          iconBorder: "1px solid rgba(153, 127, 43, 0.2)",
          iconColor: "#997F2B",
          glow: "rgba(153, 127, 43, 0.08)",
          activePillBg: "linear-gradient(135deg, #997F2B 0%, #705D1F 100%)",
          bgImage: "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=500&q=80",
          glowColor: "#997f2b"
        },
        "Bakery & Desserts": {
          bg: "linear-gradient(160deg, #FAF4FA 0%, #F1E1F1 100%)",
          border: "1px solid rgba(145, 68, 145, 0.14)",
          iconBg: "linear-gradient(135deg, #FDF2FD 0%, #EBD3EB 100%)",
          iconBorder: "1px solid rgba(145, 68, 145, 0.2)",
          iconColor: "#914491",
          glow: "rgba(145, 68, 145, 0.08)",
          activePillBg: "linear-gradient(135deg, #914491 0%, #632E63 100%)",
          bgImage: "https://images.unsplash.com/photo-1578985545062-69928b1d9587?w=500&q=80",
          glowColor: "#914491"
        }
      };
      return styles[catId] || {
        bg: "linear-gradient(160deg, #FFFFFF 0%, var(--s-card) 100%)",
        border: "1px solid rgba(160, 120, 90, 0.12)",
        iconBg: "linear-gradient(150deg, #F4E8D9 0%, #E7D3BB 100%)",
        iconBorder: "1px solid rgba(140, 101, 45, 0.25)",
        iconColor: "#7e604d",
        glow: "rgba(28, 18, 8, 0.04)",
        activePillBg: "linear-gradient(160deg, #3d2e20 0%, #1c1208 100%)",
        bgImage: "https://images.unsplash.com/photo-1484980972926-edee96e0960d?w=500&q=80",
        glowColor: "#b58a44"
      };
    };

    // Premium Category SVGs
    const CategoryIcon = ({ icon, className = "w-[18px] h-[18px]", strokeWidth = 2, ...props }) => {
      const lower = icon ? icon.toLowerCase() : "";
      if (lower === 'droplets' || lower === 'beverages' || lower === 'coffee') {
        return (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className} {...props}>
            {/* Elegant Steam Lines */}
            <path d="M6 3c.2-.8.5-.8.8 0 .2.8-.2.8 0 1.5M10 3c.2-.8.5-.8.8 0 .2.8-.2.8 0 1.5M14 3c.2-.8.5-.8.8 0 .2.8-.2.8 0 1.5" className="animate-pulse" />
            {/* Cup Body */}
            <path d="M18 8h1a3 3 0 0 1 0 6h-1M3 8h15v7a5 5 0 0 1-5 5H8a5 5 0 0 1-5-5V8z" />
            {/* Saucer */}
            <line x1="2" y1="21" x2="20" y2="21" />
          </svg>
        );
      }
      if (lower === 'glass' || lower === 'bar') {
        return (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className} {...props}>
            {/* Elegant martini shape */}
            <path d="M3 3h18l-9 9z" />
            <line x1="12" y1="12" x2="12" y2="21" />
            <line x1="7" y1="21" x2="17" y2="21" />
            {/* Liquid Line */}
            <line x1="5.5" y1="5.5" x2="18.5" y2="5.5" opacity="0.65" />
            {/* Olive on a toothpick */}
            <line x1="11" y1="2" x2="14" y2="7" strokeWidth={strokeWidth - 0.5} />
            <circle cx="11" cy="2.5" r="1.5" fill="currentColor" stroke="none" />
          </svg>
        );
      }
      if (lower === 'wind' || lower === 'hookah') {
        return (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className} {...props}>
            {/* Shisha steam vapors */}
            <path d="M10 2c-.3.7.3 1.4 0 2M14 2c-.3.7.3 1.4 0 2" opacity="0.6" />
            {/* Charcoal Tray & Bowl */}
            <path d="M9 6h6M8 8h8" />
            {/* Base Flask */}
            <path d="M12 8v4M9 14h6v5a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2v-5z" />
            {/* Sweeping Hose Pipe */}
            <path d="M14 15c2 0 4 .5 4 2v3M18 20l2-1" />
          </svg>
        );
      }
      if (lower === 'soup' || lower === 'mains' || lower === 'main eats') {
        return (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className} {...props}>
            {/* Hot Steam */}
            <path d="M9 3c.2.7-.2 1.4 0 2M12 2c.2.7-.2 1.4 0 2M15 3c.2.7-.2 1.4 0 2" opacity="0.6" />
            {/* Bowl Body & Ring */}
            <path d="M21 11a9 9 0 0 1-18 0h18z" />
            <path d="M7 21h10" />
            {/* Chopsticks resting inside */}
            <line x1="3" y1="9" x2="18" y2="16" strokeWidth={strokeWidth - 0.5} opacity="0.85" />
            <line x1="4" y1="7" x2="20" y2="14" strokeWidth={strokeWidth - 0.5} opacity="0.85" />
          </svg>
        );
      }
      if (lower === 'box' || lower === 'snacks' || lower === 'snack_and_starters') {
        return (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className} {...props}>
            {/* Premium Double Cheeseburger */}
            <path d="M3 11c0-4 3.5-7 9-7s9 3 9 7" />
            <rect x="2" y="14" width="20" height="2" rx="1" />
            <path d="M4 12l2 2h12l2-2" opacity="0.75" />
            <path d="M3 18a3 3 0 0 0 3 3h12a3 3 0 0 0 3-3" />
            {/* Sesame Seeds */}
            <path d="M7 6.5v0M12 5.5v0M17 6.5v0" strokeWidth={strokeWidth + 0.8} />
          </svg>
        );
      }
      if (lower === 'bakery' || lower === 'bakery & desserts' || lower === 'leaf') {
        return (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className} {...props}>
            {/* Flaky layered French Croissant */}
            <path d="M3 15c2.5-3 5.5-4 9-4s6.5 1 9 4c-1 2.5-4.5 4-9 4s-8-1.5-9-4z" />
            <path d="M6 14.5c1.5-2.5 3-3 6-3s4.5.5 6 3" opacity="0.8" />
            <path d="M8.5 15c1-2 2-2.2 3.5-2.2s2.5.2 3.5 2.2" opacity="0.8" />
            {/* Powdered sugar dust details */}
            <path d="M11 6.5v0M13 5.5v0" strokeWidth={strokeWidth + 0.5} />
          </svg>
        );
      }

      if (lower === 'pizza') {
        return (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className} {...props}>
            {/* Pizza Slice */}
            <path d="M15 3L3 17a1 1 0 0 0 1 1.5h14a1 1 0 0 0 1-1.2L15 3z" />
            <path d="M4 18.5c4 1 8 1 12 0" />
            {/* Pepperoni Circles */}
            <circle cx="9" cy="14" r="1.5" fill="currentColor" stroke="none" />
            <circle cx="14" cy="11" r="1.2" fill="currentColor" stroke="none" />
            <circle cx="12" cy="7" r="1" fill="currentColor" stroke="none" />
          </svg>
        );
      }
      if (lower === 'utensils') {
        return (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className} {...props}>
            {/* Fork */}
            <path d="M6 3v7a3 3 0 0 0 3 3h0a3 3 0 0 0 3-3V3" />
            <line x1="9" y1="13" x2="9" y2="21" />
            <line x1="9" y1="3" x2="9" y2="6" />
            {/* Knife */}
            <path d="M18 3v8h-3V3a2 2 0 0 1 3 0z" />
            <line x1="16.5" y1="11" x2="16.5" y2="21" />
          </svg>
        );
      }
      if (lower === 'flame') {
        return (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className} {...props}>
            <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 3z" />
          </svg>
        );
      }
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className} {...props}>
          <path d="M12 20C12 20 2 15 2 8C2 3.5 7 1 12 1C17 1 22 3.5 22 8C22 15 12 20 12 20Z" />
          <path d="M12 20V12" />
        </svg>
      );
    };

    const LoadingScreen = memo(({ isDataReady, onComplete }) => {
      const containerRef = useRef(null);
      const textRef = useRef(null);
      const subtitleRef = useRef(null);
      const lineRef = useRef(null);
      const dotRef = useRef(null);
      const orbRef = useRef(null);
      const [phase, setPhase] = useState('enter'); // enter -> hold -> exit -> done
      const [timeTheme, setTimeTheme] = useState('morning');
      const mountTime = useRef(Date.now());
      
      // Ambient time-based theming
      useEffect(() => {
        const hour = new Date().getHours();
        if (hour >= 5 && hour < 12) setTimeTheme('morning');
        else if (hour >= 12 && hour < 18) setTimeTheme('afternoon');
        else setTimeTheme('evening');
      }, []);
      
      // Phase machine
      useEffect(() => {
        if (phase === 'enter') {
          // Letters animate in via CSS, then switch to hold
          const t = setTimeout(() => setPhase('hold'), 900);
          return () => clearTimeout(t);
        }
        if (phase === 'hold' && isDataReady) {
          // Data ready — start the cinematic exit
          const t = setTimeout(() => setPhase('exit'), 400);
          return () => clearTimeout(t);
        }
        if (phase === 'hold' && !isDataReady) {
          // Data not ready yet — show loading dots, wait
          return;
        }
        if (phase === 'exit') {
          // Animate out and complete
          const t = setTimeout(() => { setPhase('done'); onComplete(); }, 1200);
          return () => clearTimeout(t);
        }
      }, [phase, isDataReady, onComplete]);
      
      // Force exit if data loads after hold phase already passed
      useEffect(() => {
        if (isDataReady && phase === 'hold') {
          const elapsed = Date.now() - mountTime.current;
          const minLoadTime = 1200;
          if (elapsed >= minLoadTime) {
            const t = setTimeout(() => setPhase('exit'), 200);
            return () => clearTimeout(t);
          } else {
            const t = setTimeout(() => setPhase('exit'), minLoadTime - elapsed + 200);
            return () => clearTimeout(t);
          }
        }
      }, [isDataReady, phase]);
      
      // Staggered letter animation for "Satkar"
      const letters = ['S', 'a', 't', 'k', 'a', 'r'];
      const letterDelays = [0, 50, 100, 150, 200, 250];
      
      // Theme-based colors
      const themeColors = {
        morning: { 
          bg: '#F7F3EB', text: '#1C1208', accent: '#C8950F', subtext: 'rgba(28, 18, 8, 0.5)', line: 'rgba(200, 149, 15, 0.5)', orb: 'rgba(160, 120, 90, 0.08)'
        },
        afternoon: { 
          bg: '#F5F2EF', text: '#1C1208', accent: '#4C6145', subtext: 'rgba(28, 18, 8, 0.45)', line: 'rgba(76, 97, 69, 0.4)', orb: 'rgba(76, 97, 69, 0.06)'
        },
        evening: { 
          bg: '#1C1208', text: '#EDD9A3', accent: '#D4A853', subtext: 'rgba(160, 120, 90, 0.4)', line: 'rgba(160, 120, 90, 0.5)', orb: 'rgba(212, 168, 83, 0.06)'
        }
      };
      const theme = themeColors[timeTheme];
      
      const isExiting = phase === 'exit';
      const isDone = phase === 'done';
      if (isDone) return null;
      
      return (
        <div 
          ref={containerRef} 
          className="fixed inset-0 z-[99999] flex flex-col items-center justify-center overflow-hidden"
          style={{ 
            background: theme.bg,
            opacity: isExiting ? 0 : 1,
            transition: 'opacity 700ms cubic-bezier(0.4, 0, 0.2, 1)',
            pointerEvents: isExiting ? 'none' : 'auto'
          }}
        >
          {/* Ambient orb that mirrors the hero orb */}
          <div 
            ref={orbRef}
            className="absolute rounded-full pointer-events-none"
            style={{ 
              width: '300px', height: '300px',
              background: `radial-gradient(ellipse at center, ${theme.orb} 0%, transparent 70%)`,
              filter: 'blur(50px)',
              top: '20%', right: '-10%',
              opacity: 0,
              animation: 'fadeIn 800ms ease-out 400ms forwards'
            }}
          />
          
          {/* Coffee steam particles */}
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            {[...Array(6)].map((_, i) => (
              <div
                key={i}
                className="absolute rounded-full"
                style={{
                  width: `${3 + i * 1.5}px`,
                  height: `${3 + i * 1.5}px`,
                  background: theme.accent,
                  opacity: 0,
                  left: `${45 + i * 3}%`,
                  bottom: `${35 + i * 5}%`,
                  animation: `steamRise ${2.5 + i * 0.3}s ease-out ${i * 0.4}s infinite`
                }}
              />
            ))}
          </div>
          
          <div className="flex flex-col items-center relative z-10 w-full">
            
            {/* Brand name — same font as hero for seamless morph */}
            <div 
              ref={textRef} 
              className="flex items-baseline origin-bottom" 
              style={{ 
                perspective: '1000px',
                transform: isExiting ? 'translateY(8vh) scale(1.15)' : 'translateY(0) scale(1)',
                opacity: isExiting ? 0 : 1,
                transition: isExiting ? 'all 900ms cubic-bezier(0.4, 0, 0.2, 1)' : 'none'
              }}
            >
              {letters.map((letter, i) => (
                <span 
                  key={i}
                  className="font-anton inline-block uppercase"
                  style={{ 
                    fontSize: 'clamp(3.8rem, 14vw, 6.5rem)',
                    fontWeight: 400,
                    letterSpacing: '0.02em',
                    color: theme.text,
                    opacity: 0,
                    transform: 'translateY(60px) scale(0.8)',
                    filter: 'blur(8px)',
                    animation: `brandLetterIn 600ms cubic-bezier(0.34, 1.56, 0.64, 1) ${letterDelays[i]}ms forwards`
                  }}
                >
                  {letter.toUpperCase()}
                </span>
              ))}
            </div>
            
            {/* Divider line — expands from center */}
            <div 
              ref={lineRef}
              className="mt-4 h-[1px] rounded-full origin-center"
              style={{ 
                width: '80px',
                background: theme.line,
                transform: 'scaleX(0)',
                animation: 'scaleX 700ms cubic-bezier(0.22, 1, 0.36, 1) 350ms forwards',
                opacity: isExiting ? 0 : 1,
                transition: isExiting ? 'opacity 400ms ease-out' : 'none'
              }}
            />
            
            {/* Subtitle — same style as hero for morph sync */}
            <div
              ref={subtitleRef}
              style={{
                opacity: isExiting ? 0 : 1,
                transform: isExiting ? 'translateY(4vh)' : 'translateY(0)',
                transition: isExiting ? 'all 800ms cubic-bezier(0.4, 0, 0.2, 1)' : 'none'
              }}
            >
              <span 
                className="mt-4 block font-sans tracking-[0.25em] uppercase"
                style={{ 
                  fontSize: 'clamp(0.75rem, 2.4vw, 0.95rem)',
                  fontWeight: 600,
                  color: theme.subtext,
                  opacity: 0,
                  animation: 'fadeIn 500ms ease-out 500ms forwards'
                }}
              >
                Bakery & Cafe
              </span>
            </div>
            
            {/* Loading dots — appear only while waiting for data */}
            <div 
              ref={dotRef}
              className="mt-12 flex gap-2"
              style={{ 
                opacity: (phase === 'hold' && !isDataReady) ? 1 : 0,
                transform: (phase === 'hold' && !isDataReady) ? 'translateY(0)' : 'translateY(8px)',
                transition: 'opacity 400ms ease, transform 400ms ease'
              }}
            >
              {[0, 1, 2].map(i => (
                <div 
                  key={i}
                  className="w-2 h-2 rounded-full"
                  style={{ 
                    background: theme.accent,
                    animation: `pulseDot 1.2s ease-in-out ${i * 0.2}s infinite`
                  }}
                />
              ))}
            </div>
          </div>
          
          <style>{`
            @keyframes brandLetterIn {
              0% { 
                opacity: 0; 
                transform: translateY(60px) scale(0.8); 
                filter: blur(8px);
              }
              50% {
                opacity: 0.8;
                filter: blur(2px);
              }
              75% {
                transform: translateY(-4px) scale(1.02);
                filter: blur(0px);
              }
              100% { 
                opacity: 1; 
                transform: translateY(0) scale(1); 
                filter: blur(0px);
              }
            }
            @keyframes scaleX { 
              to { transform: scaleX(1); } 
            }
            @keyframes pulseDot {
              0%, 100% { opacity: 0.3; transform: scale(1); }
              50% { opacity: 1; transform: scale(1.3); }
            }
            @keyframes steamRise {
              0% { opacity: 0; transform: translateY(0) scale(1); }
              20% { opacity: 0.25; }
              80% { opacity: 0.05; }
              100% { opacity: 0; transform: translateY(-80px) scale(1.5); }
            }
          `}</style>
        </div>
      );
    });

    // ─── Daily Special Carousel ───
    const DailySpecialCarousel = memo(({ specials, onSelect }) => {
      const [activeIndex, setActiveIndex] = useState(0);
      const [touchStart, setTouchStart] = useState(null);
      const [progress, setProgress] = useState(0);
      const DURATION = 5000;
      const frameRef = useRef(null);
      const startTimeRef = useRef(null);

      const startAutoPlay = () => {
        if (specials.length <= 1) return;
        setProgress(0);
        startTimeRef.current = Date.now();
        
        const animate = () => {
          const now = Date.now();
          const elapsed = now - startTimeRef.current;
          const pct = Math.min((elapsed / DURATION) * 100, 100);
          setProgress(pct);
          
          if (elapsed >= DURATION) {
            setActiveIndex(prev => (prev + 1) % specials.length);
            startTimeRef.current = Date.now();
            setProgress(0);
          }
          frameRef.current = requestAnimationFrame(animate);
        };
        
        if (frameRef.current) cancelAnimationFrame(frameRef.current);
        frameRef.current = requestAnimationFrame(animate);
      };

      useEffect(() => {
        startAutoPlay();
        return () => {
          if (frameRef.current) cancelAnimationFrame(frameRef.current);
        };
      }, [activeIndex, specials.length]);

      const handleTouchStart = (e) => {
        if (frameRef.current) cancelAnimationFrame(frameRef.current);
        setTouchStart(e.touches[0].clientX);
      };
      
      const handleTouchMove = (e) => {
        if (!touchStart) return;
        const diff = touchStart - e.touches[0].clientX;
        if (Math.abs(diff) > 50) {
          if (diff > 0) setActiveIndex(prev => (prev + 1) % specials.length);
          else setActiveIndex(prev => (prev - 1 + specials.length) % specials.length);
          setTouchStart(null);
        }
      };

      if (!specials || specials.length === 0) return null;

      return (
        <div 
          className="relative w-full overflow-hidden pb-2 select-none" 
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={() => {
            setTouchStart(null);
            startAutoPlay();
          }}
        >
          {/* Magazine Hero Cards */}
          <div className="relative h-[360px] w-full flex items-center justify-center perspective-[1200px]">
            {specials.map((item, i) => {
              const diff = (i - activeIndex + specials.length) % specials.length;
              const isCenter = diff === 0;
              const isRight = diff === 1 || (specials.length === 2 && diff === 1 && touchStart);
              const isLeft = diff === specials.length - 1;
              
              if (!isCenter && !isRight && !isLeft && specials.length > 2) return null;

              // Elevated Spring Physics style calculations
              let transform = 'translate3d(0, 0, 0) scale(1)';
              let zIndex = 10;
              let opacity = 1;
              let filter = 'blur(0px)';

              if (!isCenter) {
                zIndex = 5;
                opacity = 0.45;
                filter = 'blur(4px)';
                const sign = isLeft ? -1 : 1;
                // Peek-a-boo offset
                transform = `translate3d(${sign * 85}%, 0, -100px) scale(0.88)`;
              }

              return (
                <div
                  key={item.id}
                  className="absolute w-[85%] h-full rounded-[28px] overflow-hidden cursor-pointer"
                  style={{
                    transform, zIndex, opacity, filter,
                    transition: 'all 800ms cubic-bezier(0.19, 1, 0.22, 1)',
                    boxShadow: isCenter ? '0 30px 60px -20px rgba(28,18,8,0.7), 0 0 0 1px rgba(255,255,255,0.1)' : 'none',
                    willChange: 'transform, opacity, filter'
                  }}
                  onClick={() => {
                     if (isCenter) onSelect(item);
                     else setActiveIndex(i);
                  }}
                >
                  {/* Ken Burns Image */}
                  <div className="absolute inset-0 w-full h-full overflow-hidden bg-[#1c1208]">
                    <img 
                      src={item.imageUrl} 
                      alt={item.name} 
                      className="w-full h-full object-cover" 
                      style={{ 
                        transform: isCenter ? 'scale(1.12)' : 'scale(1.0)', 
                        transition: isCenter ? `transform ${DURATION}ms linear` : 'transform 800ms ease',
                        willChange: 'transform'
                      }} 
                    />
                  </div>
                  
                  {/* Multi-stop Gradient Vignette for Text Legibility */}
                  <div className="absolute inset-0 z-10 pointer-events-none" style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0.1) 0%, transparent 25%, transparent 40%, rgba(0,0,0,0.5) 70%, rgba(0,0,0,0.95) 100%)' }} />

                  {/* Signature badge - Premium Floating Pill */}
                  {(item.isSignatureItem || INCLUDED_SIGNATURE_NAMES.includes(item.name)) && (
                    <div 
                      className="absolute top-4 left-4 z-20 flex items-center gap-1.5 px-3 py-1.5 rounded-full backdrop-blur-md transition-all duration-700 delay-300" 
                      style={{ 
                        background: 'rgba(20, 12, 6, 0.65)', 
                        border: '1px solid rgba(217,174,99,0.3)',
                        opacity: isCenter ? 1 : 0,
                        transform: isCenter ? 'translateY(0)' : 'translateY(-10px)'
                      }}
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-[#D9AE63] animate-pulse" />
                      <span className="text-[9px] font-bold tracking-[0.2em] uppercase text-[#D9AE63]">Signature</span>
                    </div>
                  )}

                  {/* Editorial Text Block */}
                  <div className="absolute bottom-0 left-0 right-0 p-5 z-20">
                    <div 
                       className="transition-all duration-[900ms] delay-[100ms]"
                       style={{ opacity: isCenter ? 1 : 0, transform: isCenter ? 'translateY(0)' : 'translateY(20px)' }}
                    >
                       <span className="font-sans text-[10px] font-bold tracking-[0.25em] uppercase text-white/70 mb-2 block">{item.subCategoryLabel || item.category}</span>
                       <h3 className="font-display text-white text-[2.2rem] leading-[1.05] mb-5 tracking-tight drop-shadow-md" style={{ fontVariationSettings: "'wght' 500, 'opsz' 144" }}>
                         {item.name}
                       </h3>
                       
                       <div className="flex items-end justify-between">
                         <div className="flex flex-col">
                           <span className="font-sans text-[10px] uppercase tracking-widest text-white/50 mb-0.5">Price</span>
                           <div className="flex items-baseline gap-1 text-white">
                             <span className="font-price text-white/80 text-[12px]">Rs.</span>
                             <span className="font-price text-[22px] font-bold">{item.price}</span>
                           </div>
                         </div>
                         
                         {/* Magnetic Action Button */}
                         <div 
                           className="flex items-center justify-center w-11 h-11 rounded-full active:scale-95 transition-transform shadow-lg" 
                           style={{ background: 'linear-gradient(135deg, #D9AE63 0%, #B58A44 100%)', boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.4), 0 4px 14px rgba(0,0,0,0.4)' }}
                         >
                           <Icons.ChevronRight className="w-5 h-5 text-[#1a1005]" strokeWidth="2.5" />
                         </div>
                       </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          
          {/* Story-Style Progress Bars */}
          {specials.length > 1 && (
            <div className="flex justify-center gap-2 mt-6 px-8">
              {specials.map((_, i) => (
                <div key={i} className="h-1 flex-1 rounded-full bg-espresso-200/40 overflow-hidden relative backdrop-blur-sm">
                  <div 
                    className="absolute top-0 left-0 bottom-0 rounded-full"
                    style={{
                      background: 'linear-gradient(90deg, #D9AE63 0%, #B58A44 100%)',
                      width: activeIndex === i ? `${progress}%` : (i < activeIndex ? '100%' : '0%'),
                      transition: activeIndex === i ? 'none' : 'width 0.3s ease'
                    }}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      );
    });

    // ─── Screen Components ───
    const LandingScreen = memo(({ context, setView, setActiveCategory, loyalty, recent, setDetailItem, menuData, appConfig, categories, cartCount }) => {
      const heroRef = useRef(null);
      const cupRef = useRef(null);
      
      const [hoveredCard, setHoveredCard] = useState(null);

      const handleMouseMove = useCallback((e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        e.currentTarget.style.setProperty('--x', `${x}px`);
        e.currentTarget.style.setProperty('--y', `${y}px`);
      }, []);

      const shuffle = arr => { const a=[...arr]; for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];} return a; };
      const signs = useMemo(() => {
        const dayOfWeek = new Date().getDay();
        const todaysConfig = appConfig?.dailySpecials?.[dayOfWeek];
        if (todaysConfig && todaysConfig.items && todaysConfig.items.length > 0) {
          return menuData.filter(m => todaysConfig.items.includes(m.name));
        }
        return shuffle(menuData.filter(m => m.isSignatureItem)).slice(0, 8);
      }, [menuData, appConfig?.dailySpecials]);

      const timeTheme = useMemo(() => {
        const time = context.timeOfDay || 'afternoon';
        if (time === 'morning') {
          return {
            gradient: 'linear-gradient(180deg, #FFFDF9 0%, #FAF3E5 60%, #EDE8DD 100%)',
            orb: 'radial-gradient(ellipse at center, rgba(217, 174, 99, 0.22) 0%, transparent 70%)',
            shadow: 'rgba(217, 174, 99, 0.12)',
            greeting: 'Start with something warm',
            statusBorder: 'rgba(217, 174, 99, 0.22)',
            groundColor: '#EDE8DD'
          };
        } else if (time === 'afternoon') {
          return {
            gradient: 'linear-gradient(180deg, #FFFDF9 0%, #F6ECE0 60%, #EBE2D3 100%)',
            orb: 'radial-gradient(ellipse at center, rgba(140, 101, 45, 0.22) 0%, transparent 70%)',
            shadow: 'rgba(140, 101, 45, 0.12)',
            greeting: 'Treat yourself',
            statusBorder: 'rgba(140, 101, 45, 0.22)',
            groundColor: '#EBE2D3'
          };
        } else { // evening/night
          return {
            gradient: 'linear-gradient(180deg, #FFFDF9 0%, #F4EBE0 60%, #E7DEC9 100%)',
            orb: 'radial-gradient(ellipse at center, rgba(140, 101, 45, 0.12) 0%, transparent 70%)',
            shadow: 'rgba(140, 101, 45, 0.08)',
            greeting: 'Slow down together',
            statusBorder: 'rgba(140, 101, 45, 0.2)',
            groundColor: '#E7DEC9'
          };
        }
      }, [context.timeOfDay]);

      const bentoMapping = {
        "Beverages": {
          span: "col-span-1",
          badge: "Barista",
          desc: "Specialty hot coffees & organic teas",
          accentColor: "#E9B46C",
          glowColor: "rgba(233, 180, 108, 0.18)",
          borderColor: "rgba(233, 180, 108, 0.24)",
          badgeBg: "rgba(233, 180, 108, 0.10)",
          badgeBorder: "rgba(233, 180, 108, 0.25)",
          bgGradient: "linear-gradient(160deg, rgba(50, 42, 35, 0.76) 0%, rgba(20, 16, 13, 0.86) 100%)"
        },
        "Bar": {
          span: "col-span-1",
          badge: "Premium",
          desc: "Cold beers, fine spirits & cocktails",
          accentColor: "#82CFA2",
          glowColor: "rgba(130, 207, 162, 0.18)",
          borderColor: "rgba(130, 207, 162, 0.24)",
          badgeBg: "rgba(130, 207, 162, 0.10)",
          badgeBorder: "rgba(130, 207, 162, 0.25)",
          bgGradient: "linear-gradient(160deg, rgba(30, 48, 38, 0.76) 0%, rgba(12, 18, 14, 0.86) 100%)"
        },
        "Hookah": {
          span: "col-span-2",
          badge: "Lounge Vibe",
          desc: "Aromatic clouds & premium lounge pipes",
          accentColor: "#BF9BFF",
          glowColor: "rgba(191, 155, 255, 0.18)",
          borderColor: "rgba(191, 155, 255, 0.24)",
          badgeBg: "rgba(191, 155, 255, 0.10)",
          badgeBorder: "rgba(191, 155, 255, 0.25)",
          bgGradient: "linear-gradient(160deg, rgba(40, 32, 55, 0.76) 0%, rgba(15, 12, 22, 0.86) 100%)"
        },
        "Main Eats": {
          span: "col-span-2",
          badge: "Chef's Signature",
          desc: "Authentic Mo:Mo, artisan pizzas & hot dinners",
          accentColor: "#FF7A5C",
          glowColor: "rgba(255, 122, 92, 0.18)",
          borderColor: "rgba(255, 122, 92, 0.24)",
          badgeBg: "rgba(255, 122, 92, 0.10)",
          badgeBorder: "rgba(255, 122, 92, 0.25)",
          bgGradient: "linear-gradient(160deg, rgba(52, 32, 28, 0.76) 0%, rgba(20, 12, 10, 0.86) 100%)"
        },
        "Snacks & Starters": {
          span: "col-span-1",
          badge: "Quick Bites",
          desc: "Crispy wings, burgers & local savory snacks",
          accentColor: "#FFB547",
          glowColor: "rgba(255, 181, 71, 0.18)",
          borderColor: "rgba(255, 181, 71, 0.24)",
          badgeBg: "rgba(255, 181, 71, 0.10)",
          badgeBorder: "rgba(255, 181, 71, 0.25)",
          bgGradient: "linear-gradient(160deg, rgba(50, 38, 28, 0.76) 0%, rgba(18, 14, 10, 0.86) 100%)"
        },
        "Bakery & Desserts": {
          span: "col-span-2",
          badge: "Artisan Fresh",
          desc: "Fresh sourdoughs, pastries & custom bakes",
          accentColor: "#F5C270",
          glowColor: "rgba(245, 194, 112, 0.18)",
          borderColor: "rgba(245, 194, 112, 0.24)",
          badgeBg: "rgba(245, 194, 112, 0.10)",
          badgeBorder: "rgba(245, 194, 112, 0.25)",
          bgGradient: "linear-gradient(160deg, rgba(52, 42, 32, 0.76) 0%, rgba(20, 16, 12, 0.86) 100%)"
        }
      };

      const getBentoDetails = (cId, defaultDesc) => {
        return bentoMapping[cId] || {
          span: "col-span-1",
          badge: cId === "Full Menu" ? "All Bakes" : "Fresh",
          desc: defaultDesc,
          accentColor: "#E2FB52",
          glowColor: "rgba(226, 251, 82, 0.16)",
          borderColor: "rgba(226, 251, 82, 0.24)",
          badgeBg: "rgba(226, 251, 82, 0.10)",
          badgeBorder: "rgba(226, 251, 82, 0.25)",
          bgGradient: "linear-gradient(160deg, rgba(42, 42, 46, 0.72) 0%, rgba(18, 18, 20, 0.80) 100%)"
        };
      };

      // Editorial Bento Card — refined material, kicker tagline, hover chevron CTA
      const renderBentoCard = ({ keyId, hoverKey, span, bento, label, desc, kicker, onClick, iconNode, isAI = false }) => {
        const isHovered = hoveredCard === hoverKey;
        const accent = bento.accentColor;
        return (
          <button
            key={keyId}
            onClick={onClick}
            onMouseEnter={() => setHoveredCard(hoverKey)}
            onMouseLeave={() => setHoveredCard(null)}
            onMouseMove={handleMouseMove}
            className={`group relative text-left rounded-[26px] overflow-hidden flex flex-col active:scale-[0.975] transition-all duration-[600ms] ${span}`}
            style={{
              background: bento.bgGradient,
              border: `1px solid ${isHovered ? bento.borderColor : 'rgba(255,255,255,0.07)'}`,
              boxShadow: isHovered
                ? `0 24px 70px -20px ${bento.glowColor}, 0 8px 20px -8px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.16), inset 0 -1px 0 rgba(0,0,0,0.45)`
                : `0 16px 48px -18px rgba(0,0,0,0.65), inset 0 1px 0 rgba(255,255,255,0.10), inset 0 -1px 0 rgba(0,0,0,0.4)`,
              backdropFilter: 'blur(22px)',
              WebkitBackdropFilter: 'blur(22px)',
              minHeight: span === 'col-span-2' ? '172px' : '186px',
              transform: isHovered ? 'translateY(-6px)' : 'translateY(0)',
              transitionTimingFunction: 'cubic-bezier(0.22, 1, 0.36, 1)',
            }}
          >
            {/* Top hairline highlight — simulated overhead light */}
            <div className="absolute inset-x-6 top-0 h-px pointer-events-none z-10 transition-opacity duration-500" style={{
              background: `linear-gradient(90deg, transparent 0%, ${accent} 50%, transparent 100%)`,
              opacity: isHovered ? 0.85 : 0.45,
            }} />

            {/* AI hero img (only AI card) */}
            {isAI && (
              <img
                src="https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=500&q=80"
                alt=""
                loading="lazy"
                className="absolute inset-0 w-full h-full object-cover opacity-[0.22] mix-blend-luminosity group-hover:opacity-[0.34] group-hover:scale-105 transition-all duration-[900ms] pointer-events-none z-0"
              />
            )}

            {/* Accent radial glow top-right */}
            <div className="absolute -top-14 -right-14 w-48 h-48 rounded-full blur-3xl pointer-events-none z-0 transition-opacity duration-500" style={{
              background: accent,
              opacity: isHovered ? 0.22 : 0.11,
            }} />

            {/* Cursor-tracking spotlight */}
            <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none z-0" style={{
              background: `radial-gradient(140px circle at var(--x, 50%) var(--y, 50%), ${bento.glowColor}, transparent 70%)`
            }} />



            {/* Bottom inner shadow — depth */}
            <div className="absolute inset-x-0 bottom-0 h-16 pointer-events-none z-0" style={{
              background: 'linear-gradient(180deg, transparent 0%, rgba(0,0,0,0.35) 100%)'
            }} />

            {/* Content */}
            <div className="relative z-10 p-[18px] flex flex-col h-full">
              {/* Top row: icon tile + accent dot */}
              <div className="flex items-start justify-between">
                <div
                  className="relative w-11 h-11 flex items-center justify-center rounded-[13px] group-hover:scale-[1.06] transition-transform duration-[500ms]"
                  style={{
                    background: `linear-gradient(135deg, ${accent}22 0%, ${accent}06 100%)`,
                    border: `1px solid ${bento.borderColor}`,
                    color: accent,
                    boxShadow: `inset 0 1px 0 rgba(255,255,255,0.14), 0 6px 18px -6px ${bento.glowColor}`,
                  }}
                >
                  {iconNode}
                </div>

                {/* Accent dot indicator */}
                <span className="relative flex items-center justify-center w-1.5 h-1.5 mt-1.5 rounded-full transition-all duration-500" style={{
                  background: accent,
                  boxShadow: isHovered ? `0 0 12px ${accent}, 0 0 4px ${accent}` : `0 0 4px ${accent}80`,
                  opacity: isHovered ? 1 : 0.6,
                }} />
              </div>

              {/* Bottom content block */}
              <div className="mt-auto pt-4 pr-8">


                {/* Title — Fraunces serif, refined */}
                <div
                  className="font-display text-[20px] leading-[1.05] tracking-[-0.015em] mb-1.5 transition-colors duration-300"
                  style={{
                    color: isHovered ? accent : '#ffffff',
                    fontVariationSettings: "'opsz' 144, 'wght' 450",
                  }}
                >
                  {label}
                </div>

                {/* Subtitle */}
                <div className="font-sans text-[10.5px] leading-[1.45] text-white/55 font-medium line-clamp-1 group-hover:text-white/75 transition-colors duration-300">
                  {desc}
                </div>
              </div>

              {/* Hover chevron CTA */}
              <div
                className="absolute bottom-[14px] right-[14px] z-10 flex items-center justify-center w-7 h-7 rounded-full transition-all duration-500 opacity-0 group-hover:opacity-100 translate-x-1.5 group-hover:translate-x-0"
                style={{
                  background: accent,
                  color: '#0d0904',
                  boxShadow: `0 8px 20px -4px ${bento.glowColor}, inset 0 1px 0 rgba(255,255,255,0.4)`,
                }}
                aria-hidden="true"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14M13 5l7 7-7 7" />
                </svg>
              </div>
            </div>
          </button>
        );
      };

      // Dynamic Bento Grid Packing Algorithm (Tetris-style perfect alignment)
      const packedGridItems = useMemo(() => {
        const span2 = [];
        const span1 = [];
        
        categories.forEach(c => {
          const bento = getBentoDetails(c.id, c.desc);
          if (bento.span === 'col-span-2') {
            span2.push({ type: 'category', data: c, span: 2 });
          } else {
            span1.push({ type: 'category', data: c, span: 1 });
          }
        });
        
        // Push manual items
        span1.push({ type: 'full_menu', span: 1 });
        span2.push({ type: 'ai_assistant', span: 2 });
        
        const packed = [];
        let s2Index = 0;
        let s1Index = 0;
        let alternate = true;
        
        while (s2Index < span2.length || s1Index < span1.length) {
          if (alternate) {
            if (s2Index < span2.length) packed.push(span2[s2Index++]);
            if (s1Index < span1.length) packed.push(span1[s1Index++]);
          } else {
            if (s1Index < span1.length) packed.push(span1[s1Index++]);
            if (s2Index < span2.length) packed.push(span2[s2Index++]);
          }
          alternate = !alternate;
        }
        return packed;
      }, [categories]);

      return (
        <div className={`${cartCount > 0 ? 'pb-44' : 'pb-24'} animate-fade-in relative z-10 w-full overflow-x-hidden`}>
          {/* Inject Dynamic Keyframe Styles */}
          <style>{`
            :root {
              ${appConfig?.primaryColor ? `--s-accent: ${appConfig.primaryColor};` : ''}
              ${appConfig?.backgroundColor ? `--s-ground: ${appConfig.backgroundColor};` : ''}
            }
            @keyframes steamRise {
              0% { opacity: 0; transform: translateY(15px) scale(0.8) rotate(0deg); }
              30% { opacity: 0.45; }
              80% { opacity: 0.08; }
              100% { opacity: 0; transform: translateY(-70px) scale(1.3) rotate(6deg); }
            }
            .steam-path-1 { animation: steamRise 6s ease-in-out infinite; }
            .steam-path-2 { animation: steamRise 5s ease-in-out 1.5s infinite; }
            .steam-path-3 { animation: steamRise 7s ease-in-out 3.2s infinite; }
            
            @keyframes reflectionSweep {
              0% { transform: translateX(-100%) rotate(-12deg); }
              100% { transform: translateX(100%) rotate(-12deg); }
            }
            .group:hover .bento-reflection {
              animation: reflectionSweep 1.2s cubic-bezier(0.25, 1, 0.5, 1) forwards;
            }
            
            @keyframes floatParticle {
              0%, 100% { transform: translateY(0px) scale(1); opacity: 0.25; }
              50% { transform: translateY(-10px) scale(1.15); opacity: 0.65; }
            }
            .ai-particle-1 { animation: floatParticle 4s ease-in-out infinite; }
            .ai-particle-2 { animation: floatParticle 5s ease-in-out 1.2s infinite; }
            .ai-particle-3 { animation: floatParticle 6s ease-in-out 2.8s infinite; }
          `}</style>

          {/* Hero Section — Immersive Editorial Design in native 9:16 aspect ratio */}
          <div className="relative w-full aspect-[9/16] flex flex-col justify-end pt-12 pb-14 px-8 overflow-hidden bg-transparent">
            {/* Hero-bound background video — mask physically dissolves into cream */}
            <video
              src="/mmm.mp4"
              autoPlay
              loop
              muted
              playsInline
              preload="auto"
              disablePictureInPicture
              disableRemotePlayback
              aria-hidden="true"
              style={{
                willChange: 'transform',
                WebkitMaskImage: 'linear-gradient(180deg, #000 0%, #000 38%, rgba(0,0,0,0.85) 60%, rgba(0,0,0,0.45) 80%, rgba(0,0,0,0.15) 92%, transparent 100%)',
                maskImage: 'linear-gradient(180deg, #000 0%, #000 38%, rgba(0,0,0,0.85) 60%, rgba(0,0,0,0.45) 80%, rgba(0,0,0,0.15) 92%, transparent 100%)',
              }}
              className="absolute inset-0 w-full h-full object-cover z-0 pointer-events-none"
            />
            {/* Subtle time-of-day tonal wash — masked the same way so it doesn't show a band */}
            <div
              aria-hidden="true"
              className="absolute inset-0 z-0 opacity-[0.10] transition-all duration-1000 pointer-events-none"
              style={{
                background: timeTheme.gradient,
                WebkitMaskImage: 'linear-gradient(180deg, #000 0%, #000 38%, rgba(0,0,0,0.85) 60%, rgba(0,0,0,0.45) 80%, rgba(0,0,0,0.15) 92%, transparent 100%)',
                maskImage: 'linear-gradient(180deg, #000 0%, #000 38%, rgba(0,0,0,0.85) 60%, rgba(0,0,0,0.45) 80%, rgba(0,0,0,0.15) 92%, transparent 100%)',
              }}
            />
            {/* Ambient Fade Gradients */}
            {/* Top soft shadow */}
            <div className="absolute inset-x-0 top-0 h-24 z-20" style={{ background: 'linear-gradient(180deg, rgba(28,18,8,0.12) 0%, transparent 100%)' }}></div>
            
            {/* Announcement Banner */}
            {appConfig?.announcementActive && appConfig?.announcementText && (
              <div className="absolute top-0 left-0 right-0 z-50 bg-espresso-950/90 backdrop-blur-md text-sand-50 px-4 py-2.5 text-center shadow-md">
                <span className="font-sans text-[9px] uppercase tracking-[0.2em] font-bold block pt-safe">
                  {appConfig.announcementText}
                </span>
              </div>
            )}

            {/* Dynamic Time-of-Day Ambient Orb */}
            <div 
              className="absolute w-[300px] h-[300px] rounded-full pointer-events-none transition-all duration-1000 z-20"
              style={{ 
                background: timeTheme.orb,
                filter: 'blur(50px)',
                bottom: '5%',
                left: '50%',
                transform: 'translateX(-50%)'
              }}
            />
            
            {/* Loyalty Badge */}
            {loyalty.visits > 0 && (
              <div className="absolute top-6 right-6 z-10">
                <div className="flex items-center gap-2 px-3 py-1.5" style={{ background: 'rgba(255, 255, 255, 0.45)', backdropFilter: 'blur(12px)', borderRadius: '999px', border: '1px solid rgba(255, 255, 255,0.3)', boxShadow: '0 4px 12px rgba(0,0,0,0.04)' }}>
                  <span className="w-1.5 h-1.5 rounded-full bg-brown-500"></span>
                  <span className="font-sans text-[10px] font-bold tracking-widest uppercase text-espresso-800">Visit #{loyalty.visits}</span>
                </div>
              </div>
            )}
 
            {/* Hero Content — Centered & Elegant */}
            <div className="relative z-10 flex flex-col items-center text-center">
              <h1 className="leading-[0.85] flex flex-col items-center hero-brand-in">
                <span
                  className="block font-anton tracking-[0.015em] uppercase select-none"
                  style={{
                    fontSize: 'clamp(4.2rem, 16vw, 7rem)',
                    fontWeight: 400,
                    background: 'linear-gradient(180deg, #4a2e18 0%, #2e1a0c 55%, #1a0f06 100%)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text',
                    filter: 'drop-shadow(0 1px 0 rgba(255, 222, 170, 0.22)) drop-shadow(0 2px 4px rgba(20, 12, 6, 0.32))',
                  }}
                >
                  Satkar
                </span>
              </h1>
              
              <div className="flex items-center justify-center gap-3 mt-6 mb-7 hero-subtitle-in opacity-90 w-full">
                <div className="w-12 h-[1px] bg-gradient-to-r from-transparent to-espresso-800/40"></div>
                <span className="block font-sans text-espresso-900 text-[10px] tracking-[0.45em] uppercase font-bold">Bakery & Cafe</span>
                <div className="w-12 h-[1px] bg-gradient-to-l from-transparent to-espresso-800/40"></div>
              </div>
 
              {(() => {
                const hour = new Date().getHours();
                const openTime = appConfig?.openTime ?? 8;
                const closeTime = appConfig?.closeTime ?? 22;
                const formatTime = (h) => {
                  const ampm = h >= 12 && h < 24 ? 'PM' : 'AM';
                  const hour12 = h % 12 || 12;
                  return `${hour12} ${ampm}`;
                };
                const isOpen = hour >= openTime && hour < closeTime;
                return (
                  <div className="hero-subtitle-in flex flex-col items-center gap-2.5">
                    <span className="font-sans text-[9px] tracking-[0.3em] uppercase text-espresso-600/80 font-bold">{isOpen ? `Open · ${formatTime(openTime)} – ${formatTime(closeTime)}` : `Closed · Opens ${formatTime(openTime)}`}</span>
                    <div className="flex items-center justify-center gap-2 px-5 py-2.5 transition-all duration-300" style={{ background: 'rgba(255,255,255,0.65)', backdropFilter: 'blur(12px)', borderRadius: '100px', border: `1px solid ${timeTheme.statusBorder}`, boxShadow: `0 4px 20px ${timeTheme.shadow}` }}>
                      <span className={`w-2 h-2 rounded-full relative flex`}>
                        <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${isOpen ? 'bg-green-400' : 'bg-red-400'}`}></span>
                        <span className={`relative inline-flex rounded-full h-2 w-2 ${isOpen ? 'bg-green-500 shadow-[0_0_6px_rgba(34,197,94,0.6)]' : 'bg-red-400'}`}></span>
                      </span>
                      <span className={`font-sans text-[10.5px] font-bold tracking-[0.2em] uppercase ${isOpen ? 'text-espresso-950' : 'text-red-700'}`}>
                        {isOpen ? timeTheme.greeting : 'Sorry, we are closed'}
                      </span>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
 
          {/* Menu Categories — Asymmetric Bento Grid */}
          <div className="mx-5 mb-10 -mt-6 relative z-20">
            {/* Section header */}
            <div className="flex items-center gap-3 mb-5 px-1">
              <span className="h-px w-6" style={{ background: 'linear-gradient(90deg, transparent 0%, rgba(217,174,99,0.65) 100%)' }} />
              <span className="font-sans text-[8.5px] font-bold tracking-[0.32em] uppercase" style={{ color: 'rgba(217,174,99,0.95)' }}>The Menu</span>
              <span className="flex-1 h-px" style={{ background: 'linear-gradient(90deg, rgba(217,174,99,0.25) 0%, transparent 100%)' }} />
              <span className="font-sans text-[8.5px] font-bold tracking-[0.22em] uppercase text-white/40 tabular-nums">{categories.length + 2} Chapters</span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {packedGridItems.map((item, idx) => {
                if (item.type === 'category') {
                  const c = item.data;
                  const bento = getBentoDetails(c.id, c.desc);
                  return renderBentoCard({
                    keyId: c.id,
                    hoverKey: `cat-${c.id}`,
                    span: item.span === 2 ? 'col-span-2' : 'col-span-1',
                    bento: bento,
                    label: c.label,
                    desc: bento.desc,
                    kicker: bento.badge,
                    onClick: () => { setActiveCategory(c.id); setView('menu'); },
                    iconNode: <CategoryIcon icon={c.id} />,
                  });
                }
                if (item.type === 'full_menu') {
                  const bento = getBentoDetails('Full Menu', 'Browse the complete selection');
                  return renderBentoCard({
                    keyId: 'full_menu',
                    hoverKey: 'cat-full_menu',
                    span: item.span === 2 ? 'col-span-2' : 'col-span-1',
                    bento: bento,
                    label: 'Full Menu',
                    desc: bento.desc,
                    kicker: bento.badge,
                    onClick: () => { setActiveCategory('All'); setView('menu'); },
                    iconNode: <CategoryIcon icon="Menu" />,
                  });
                }
                if (item.type === 'ai_assistant') {
                  const bento = getBentoDetails('Ask Satkar AI', "Not sure what to order? Let's chat");
                  bento.accentColor = '#E2FB52'; // Override for AI
                  return renderBentoCard({
                    keyId: 'ai_assistant',
                    hoverKey: 'cat-ai_assistant',
                    span: item.span === 2 ? 'col-span-2' : 'col-span-1',
                    bento: bento,
                    label: 'Ask Satkar AI',
                    desc: "Not sure what to order? Let's chat",
                    kicker: 'Assistant',
                    onClick: () => setView('assistant'),
                    iconNode: <Icons.Sparkles className="w-[18px] h-[18px]" strokeWidth={2} />,
                    isAI: true,
                  });
                }
                return null;
              })}
            </div>
          </div>

          {/* Daily Highlight Carousel - Now Dynamic from Admin */}
          {signs && signs.length > 0 && (
            <div className="px-5 mb-14">
              <div className="flex items-end justify-between mb-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-display text-[1.5rem] leading-none text-espresso-950" style={{ fontVariationSettings: "'wght' 400, 'opsz' 144" }}>Daily Specials</span>
                    <span className="w-2 h-2 rounded-full bg-brown-400 animate-pulse mt-1"></span>
                  </div>
                </div>
                <span className="font-sans text-[10px] font-semibold text-espresso-400 tracking-wide pb-1">{signs.length} dishes</span>
              </div>
              <DailySpecialCarousel 
                specials={signs} 
                onSelect={(item) => setDetailItem(item)} 
              />
            </div>
          )}

          {/* Recently Viewed */}
          {recent && recent.length > 0 && (
            <div className="mb-10">
              <div className="px-5 flex items-center justify-between mb-4">
                <span className="font-sans text-[10px] font-bold tracking-[0.14em] uppercase text-espresso-500">Recent</span>
              </div>
              <div className="flex overflow-x-auto gap-4 hide-scrollbar pb-4 px-5">
                {recent.slice(0, 5).map(item => (
                  <div
                    key={item.id}
                    className="group w-[110px] shrink-0 cursor-pointer active:scale-[0.98] hover:-translate-y-0.5 transition-all duration-300"
                    onClick={() => setDetailItem(item)}
                  >
                    <div className="w-full aspect-square rounded-[18px] overflow-hidden mb-2 bg-[#F5F2EF]" style={{ boxShadow: '0 1px 2px rgba(28,18,8,0.05), 0 10px 22px -12px rgba(28,18,8,0.28)', border: '1px solid rgba(160,120,90,0.12)' }}>
                      <img src={item.imageUrl} loading="lazy" className="w-full h-full object-cover transition-transform duration-500 group-active:scale-105" alt={item.name} />
                    </div>
                    <div className="font-sans text-[12px] font-medium text-espresso-900 line-clamp-1 text-center">{item.name}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      );
    });
    // ─── Showcase Components (The Editorial Spine) ───
    const ShowcaseItem = memo(({ item, onSelect, index, showSideLabel }) => {
      const frameRef  = useRef(null);
      const cardRef   = useRef(null);
      const titleRef  = useRef(null);
      const descRef   = useRef(null);
      const labelRef  = useRef(null);
      const entered   = useRef(false);

      const isSig = item.isSignatureItem || INCLUDED_SIGNATURE_NAMES.includes(item.name);
      const alignment = isSig ? 'center' : (index % 2 === 0 ? 'left' : 'right');
      const num = String(index + 1).padStart(2, '0');

      useEffect(() => {
        const card = cardRef.current;
        const tit  = titleRef.current;
        const desc = descRef.current;
        const frame = frameRef.current;
        if (!card || !frame) return;

        // Entry states
        card.style.opacity   = '0';
        card.style.transform = `translateY(24px) scale(0.96)`;
        if (tit) { 
          tit.style.opacity = '0'; 
          tit.style.letterSpacing = '0.02em';
          tit.style.transform = 'translateX(8px)'; 
        }
        if (desc) { desc.style.opacity = '0'; desc.style.transform = 'translateY(8px)'; }

        const ease = 'cubic-bezier(0.2, 0.8, 0.2, 1)';
        const obs = new IntersectionObserver(([entry]) => {
          if (!entry.isIntersecting || entered.current) return;
          entered.current = true;

          card.style.transition = `opacity 0.7s ${ease}, transform 0.8s ${ease}`;
          card.style.opacity    = '1';
          card.style.transform  = 'translateY(0) scale(1)';

          if (tit) setTimeout(() => {
            tit.style.transition = `opacity 0.6s ${ease}, transform 0.6s ${ease}, letter-spacing 0.8s ${ease}`;
            tit.style.opacity = '1'; tit.style.transform = 'translateX(0)';
            tit.style.letterSpacing = '-0.02em';
          }, 150);
          
          if (desc) setTimeout(() => {
            desc.style.transition = `opacity 0.5s ${ease}, transform 0.5s ${ease}`;
            desc.style.opacity = '1'; desc.style.transform = 'translateY(0)';
          }, 250);
        }, { threshold: 0.1 });

        obs.observe(frame);
        return () => obs.disconnect();
      }, [alignment]);

      // Parallax: Side labels and opposing drifts (Scaled down for compact layout)
      useEffect(() => {
        const frame = frameRef.current;
        const card  = cardRef.current;
        const label = labelRef.current;
        if (!frame || !card) return;
        
        const scroller = frame.closest('.scrollable-area') || window;
        const onScroll = () => {
          if (!entered.current) return;
          const rect   = frame.getBoundingClientRect();
          const winH   = window.innerHeight;
          const center = rect.top + rect.height / 2;
          const ratio  = (winH / 2 - center) / winH;
          const clamped = Math.max(-0.5, Math.min(0.5, ratio));
          
          // Cards drift — subtle vertical only for side-by-side
          const yOff = clamped * 12;
          card.style.transform = `translate3d(0, ${yOff}px, 0)`;
          
          if (label) {
            label.style.transform = `translateY(${clamped * -60}px)`;
          }
        };
        scroller.addEventListener('scroll', onScroll, { passive: true });
        return () => scroller.removeEventListener('scroll', onScroll);
      }, [alignment]);

      const isVeg = item.foodType === 'veg';
      const isNonVeg = item.foodType === 'non-veg';
      const showFoodTag = isVeg || isNonVeg;
      const isSpicy = item.flavorProfile?.includes('spicy');
      const descLine = item.description ? item.description.split('.')[0] + '.' : null;

      return (
        <div ref={frameRef} className={`sc-frame sc-align-${alignment}`} onClick={() => onSelect(item)}>
          {/* Vertical Side Label */}
          {showSideLabel && (
            <div className={`sc-side-label sc-label-${index % 2 === 0 ? 'left' : 'right'}`} aria-hidden="true" ref={labelRef}>
              <span className="sc-side-label-text">{item.category}</span>
            </div>
          )}

          {/* Hand-inked Index */}
          <div className="sc-index font-display" aria-hidden="true">
            <span className="sc-index-num">{num}</span>
            {isSig && <span className="sc-sig-icon">✦</span>}
          </div>

          {/* Lived-in Tape */}
          {alignment === 'left' && <div className="sc-tape sc-tape-tr" />}
          {alignment === 'right' && <div className="sc-tape sc-tape-tl" />}

          {/* Photo Card */}
          <div ref={cardRef} className={`sc-card ${!item.inStock ? 'opacity-60 grayscale' : ''}`}>
            <img src={item.imageUrl} alt={item.name} loading="lazy" className="sc-card-img" />
            <div className="sc-card-veil" />
            
            {!item.inStock && (
              <div className="absolute inset-0 z-20 flex items-center justify-center">
                <span className="bg-espresso-950/80 backdrop-blur-md border border-white/10 text-white font-sans font-bold text-xs uppercase tracking-widest px-4 py-2 rounded-full shadow-xl">
                  Sold Out
                </span>
              </div>
            )}
            
            {/* Diet tags */}
            <div className="absolute top-3 left-3 z-10 flex gap-1.5 flex-wrap max-w-[80%]">
              {showFoodTag && (
              <div className="bg-black/30 backdrop-blur-md px-2 py-1 rounded-md border border-white/10 flex items-center gap-1">
                <div className="w-1.5 h-1.5 rounded-full" style={{ background: isVeg ? 'var(--veg)' : 'var(--nonveg)' }} />
                <span className="text-[10px] font-bold text-white uppercase tracking-wider">{isVeg ? 'Veg' : 'Non-veg'}</span>
              </div>
              )}
              {isSpicy && (
                <div className="bg-red-900/30 backdrop-blur-md px-2 py-1 rounded-md border border-white/10">
                  <span className="text-[10px] font-bold text-white uppercase tracking-wider">Spicy</span>
                </div>
              )}
            </div>

            {/* Overlapping Price Tag */}
            <div className="sc-price-tag font-price">
              <span className="text-[11px] opacity-60 mr-1">Rs.</span>
              {item.price}
            </div>
          </div>

          {/* Title + Metadata alongside card */}
          <div className="sc-title-wrap" ref={titleRef}>
            <div className="flex flex-col min-w-0">
              <span className="sc-title-text font-display">{item.name}</span>
              <div className="sc-meta font-sans">
                <span className="sc-cat-label">{item.subCategoryLabel || item.category}</span>
              </div>
            </div>
          </div>
        </div>
      );
    });

    const ShowcaseScroll = memo(({ items, onSelect }) => {
      if (items.length === 0) {
        return (
          <div className="flex flex-col items-center justify-center py-24 text-espresso-400">
            <p className="font-sans font-bold uppercase tracking-widest text-[11px] opacity-40">Library Empty</p>
          </div>
        );
      }

      let lastCat = null;

      return (
        <div className="sc-scroll">
          {items.map((item, i) => {
            const showLabel = item.category !== lastCat;
            lastCat = item.category;
            return (
              <ShowcaseItem key={item.id} item={item} index={i} onSelect={onSelect} showSideLabel={showLabel} />
            );
          })}
          <div className="sc-end font-sans">
            <div className="sc-end-line" />
            <span className="sc-end-text">Kitchen Closed</span>
            <div className="sc-end-line" />
          </div>
        </div>
      );
    });

    const MenuGalleryScreen = memo(({ activeCategory, setActiveCategory, setDetailItem, back, menuData, categories, addToCart }) => {
      const [search, setSearch] = useState("");
      const [subCat, setSubCat] = useState("all");
      const [dietary, setDietary] = useState("all");
      const [showFilters, setShowFilters] = useState(false);
      const [addedId, setAddedId] = useState(null);
      const [layoutMode, setLayoutMode] = useState("showcase");
      const mounted = useRef(false); useEffect(() => { mounted.current = true; }, []);
      
      const filtered = useMemo(() => {
        let res = menuData;
        if (activeCategory !== "All") res = res.filter(m => m.category === activeCategory);
        if (subCat !== "all") res = res.filter(m => m.subCategory === subCat);
        if (dietary === "veg") res = res.filter(m => m.foodType === 'veg');
        if (dietary === "nonveg") res = res.filter(m => m.foodType === 'non-veg');
        if (dietary === "spicy") res = res.filter(m => m.flavorProfile.includes('spicy'));
        if (search) res = res.filter(m => fuzzyMatch(search, m.name) > 0);
        return res;
      }, [activeCategory, subCat, search, dietary, menuData]);

      const subCategories = useMemo(() => {
        let base = menuData;
        if (activeCategory !== "All") base = base.filter(m => m.category === activeCategory);
        const unique = [...new Set(base.map(m => m.subCategory))];
        return unique.map(u => ({ id: u, label: subCategoryMap[u] || u }));
      }, [activeCategory, menuData]);

      useEffect(() => { setSubCat("all"); }, [activeCategory]);

      return (
        <div className="min-h-screen ambient-bg pb-24 animate-slide-up overflow-x-hidden" style={{ background: 'var(--s-ground)' }}>
          {/* Solid Theme Header */}
          <div 
            className="sticky top-0 z-50 pb-3 pt-6 lg:pt-8 pt-safe"
            style={{ 
              background: 'var(--s-ground)',
              borderBottom: '1px solid var(--glass-border)',
              boxShadow: '0 4px 24px rgba(28, 18, 8, 0.06)'
            }}
          >
            <div className="flex items-center gap-3 px-4 pb-2">
              <div className="shrink-0">
                <button 
                  className="glass-card w-11 h-11 flex items-center justify-center shrink-0 haptic-light active:scale-95 transition-all"
                  style={{ borderRadius: 'var(--r-btn)' }}
                  onClick={back} 
                  aria-label="Go Back"
                >
                  <Icons.ChevronLeft className="w-5 h-5 text-espresso-700 hover:scale-105 transition-transform" strokeWidth="2.5" />
                </button>
              </div>

              <div className="flex-1 relative">
                <input 
                  type="text" 
                  placeholder="Search menu..." 
                  value={search} 
                  onChange={e=>setSearch(e.target.value)} 
                  className="w-full py-2.5 pl-10 pr-4 text-sm focus:outline-none placeholder:text-espresso-400/70"
                  style={{
                    background: 'rgba(255, 255, 255, 0.7)',
                    backdropFilter: 'blur(8px)',
                    WebkitBackdropFilter: 'blur(8px)',
                    border: '1px solid rgba(139, 99, 71, 0.15)',
                    borderRadius: 'var(--r-btn)',
                    color: '#1c1208',
                    transition: 'all 300ms cubic-bezier(0.4, 0, 0.2, 1)'
                  }}
                  onFocus={e => { e.target.style.borderColor = 'rgba(181, 138, 68, 0.45)'; e.target.style.boxShadow = '0 0 0 4px rgba(181, 138, 68, 0.12), 0 4px 16px rgba(28, 18, 8, 0.04)'; e.target.style.background = '#ffffff'; }}
                  onBlur={e => { e.target.style.borderColor = 'rgba(139, 99, 71, 0.15)'; e.target.style.boxShadow = 'none'; e.target.style.background = 'rgba(255, 255, 255, 0.7)'; }}
                  aria-label="Search Menu" 
                />
                <Icons.Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 transition-colors duration-300" strokeWidth="2" style={{ color: search ? '#B58A44' : 'rgba(28,18,8,0.4)' }} />
                {search && <button className="absolute right-3 top-1/2 -translate-y-1/2 text-espresso-400 p-1 haptic-light hover:text-red-500 transition-colors" aria-label="Clear Search" onClick={()=>setSearch("")}><Icons.X className="w-4 h-4" /></button>}
                {search && <span className="absolute left-[30px] top-[14px] w-1.5 h-1.5 rounded-full bg-brown-500 animate-ping"></span>}
              </div>
              
              {/* Right Wing: Balanced with left */}
              <div className="w-[96px] flex items-center justify-end gap-2 shrink-0">
                <button
                  className="glass-card w-11 h-11 flex items-center justify-center shrink-0 cursor-pointer haptic-light active:scale-95 transition-all"
                  style={{ 
                    background: layoutMode === 'showcase' ? 'linear-gradient(135deg, #523d32 0%, #1c1208 100%)' : 'var(--glass-bg)',
                    border: layoutMode === 'showcase' ? '1px solid transparent' : '1px solid var(--glass-border)',
                    borderRadius: 'var(--r-btn)',
                    color: layoutMode === 'showcase' ? 'rgba(255,255,255,0.92)' : '#1c1208',
                    boxShadow: layoutMode === 'showcase' ? '0 4px 16px rgba(28,18,8,0.3)' : 'var(--glass-shadow)'
                  }}
                  onClick={() => { haptic('light'); setLayoutMode(l => l === 'list' ? 'showcase' : 'list'); }}
                  aria-label="Toggle layout"
                >
                  {layoutMode === 'showcase' ? <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4 hover:rotate-12 transition-transform" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="3" y1="9" x2="21" y2="9"></line><line x1="9" y1="21" x2="9" y2="9"></line></svg> : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 hover:scale-105 transition-transform"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>}
                </button>
                <button
                  className="glass-card w-11 h-11 flex items-center justify-center shrink-0 cursor-pointer haptic-light active:scale-95 transition-all"
                  style={{ 
                    background: showFilters ? 'linear-gradient(135deg, #D9AE63 0%, #B58A44 100%)' : 'var(--glass-bg)',
                    border: showFilters ? '1px solid transparent' : '1px solid var(--glass-border)',
                    borderRadius: 'var(--r-btn)',
                    color: showFilters ? '#1c1208' : '#1c1208',
                    boxShadow: showFilters ? '0 4px 14px -3px rgba(140,101,45,0.55)' : 'var(--glass-shadow)'
                  }}
                  onClick={() => setShowFilters(f => !f)}
                  aria-label="Toggle filters"
                  aria-expanded={showFilters}
                >
                  <Icons.Filter className={`w-4 h-4 transition-transform duration-300 ${showFilters ? 'rotate-180' : ''}`} strokeWidth="2" />
                </button>
              </div>
            </div>

            {/* Category Pills */}
            <div className="relative -mx-4 px-4 overflow-hidden">
              {/* Fading Edge Overlays */}
              <div className="absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-[#EDE8DD] to-transparent pointer-events-none z-10" />
              <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-[#EDE8DD] to-transparent pointer-events-none z-10" />
              
              <div className="overflow-x-auto hide-scrollbar flex gap-2 pt-1 pb-1.5 px-4">
                <button 
                  className="shrink-0 px-4 py-2 text-xs font-semibold tracking-wide transition-all haptic-light min-h-[38px] flex items-center gap-1.5"
                  style={{
                    background: activeCategory === "All" ? 'linear-gradient(135deg, #3d2e20 0%, #1c1208 100%)' : 'var(--glass-bg)',
                    border: activeCategory === "All" ? '1px solid transparent' : '1px solid rgba(28,18,8,0.08)',
                    borderRadius: 'var(--r-btn)',
                    color: activeCategory === "All" ? 'rgba(255,255,255,0.92)' : '#6b5b4f',
                    boxShadow: activeCategory === "All" ? '0 4px 12px rgba(28,18,8,0.18)' : 'var(--glass-shadow)'
                  }}
                  onClick={() => {haptic('light'); setActiveCategory("All")}}
                >
                  <Icons.Home className="w-[14px] h-[14px]" strokeWidth="2.2" />
                  <span>All</span>
                  <span className={`text-[10px] opacity-60 ${activeCategory === "All" ? 'text-white' : 'text-espresso-400'}`}>({menuData.length})</span>
                </button>
                {categories.map(c => {
                  const style = getCategoryStyles(c.id);
                  const isSelected = activeCategory === c.id;
                  return (
                    <button 
                      key={c.id} 
                      className="shrink-0 px-4 py-2 text-xs font-semibold tracking-wide transition-all haptic-light flex items-center gap-1.5 min-h-[38px]"
                      style={{
                        background: isSelected ? style.activePillBg : 'var(--glass-bg)',
                        border: isSelected ? '1px solid transparent' : '1px solid rgba(28,18,8,0.08)',
                        borderRadius: 'var(--r-btn)',
                        color: isSelected ? '#ffffff' : style.iconColor,
                        boxShadow: isSelected ? `0 4px 12px ${style.glow}` : 'var(--glass-shadow)'
                      }}
                      onClick={() => {haptic('light'); setActiveCategory(c.id)}}
                    >
                      <CategoryIcon icon={c.icon} className="w-[14px] h-[14px]" strokeWidth="2.5" />
                      <span>{c.label}</span>
                      <span className={`text-[10px] opacity-60 ${isSelected ? 'text-white' : 'text-espresso-400'}`}>({menuData.filter(m => m.category === c.id).length})</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {showFilters && (
              <div className="animate-slide-up">
                {/* ── Dietary Filter Row ── */}
                <div className="relative -mx-4 px-4 overflow-hidden">
                  <div className="absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-[#EDE8DD] to-transparent pointer-events-none z-10" />
                  <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-[#EDE8DD] to-transparent pointer-events-none z-10" />
                  
                  <div className="overflow-x-auto hide-scrollbar flex gap-2 pt-2 pb-1.5 px-4">
                    <div className="shrink-0 flex items-center gap-1 text-[10px] font-bold text-espresso-400 tracking-[0.12em] uppercase mr-1 select-none">
                      <Icons.Filter className="w-3 h-3" strokeWidth="2.5"/>
                      Diet
                    </div>
                    {[
                      { id:'all',    l:'All',     activeBg:'linear-gradient(135deg,#6b7280 0%,#4b5563 100%)', glow:'rgba(107,114,128,0.3)', border:'rgba(107,114,128,0.5)' },
                      { id:'veg',    l:'Veg',     activeBg:'linear-gradient(135deg,#3a7d44 0%,#245c2c 100%)', glow:'rgba(58,125,68,0.35)',  border:'rgba(58,125,68,0.6)'  },
                      { id:'nonveg', l:'Non-Veg', activeBg:'linear-gradient(135deg,#b85c3c 0%,#8a3a24 100%)', glow:'rgba(184,92,60,0.35)',  border:'rgba(184,92,60,0.6)'  },
                      { id:'spicy',  l:'Spicy',   activeBg:'linear-gradient(135deg,#d4542a 0%,#a83218 100%)', glow:'rgba(212,84,42,0.35)',  border:'rgba(212,84,42,0.6)'  }
                    ].map(d => {
                      const isSel = dietary === d.id;
                      return (
                        <button
                          key={d.id}
                          className="shrink-0 text-[11px] px-3.5 py-2 font-semibold transition-all haptic-light select-none"
                          style={{
                            borderRadius: 'var(--r-btn)',
                            background: isSel ? d.activeBg : 'var(--glass-bg)',
                            border: isSel ? `1px solid ${d.border}` : '1px solid rgba(28,18,8,0.08)',
                            color: isSel ? '#ffffff' : '#6b5b4f',
                            boxShadow: isSel ? `0 4px 14px ${d.glow}` : 'var(--glass-shadow)',
                            transform: isSel ? 'scale(1.04)' : 'scale(1)',
                            letterSpacing: '0.02em'
                          }}
                          onClick={()=>{haptic('light');setDietary(d.id)}}
                        >{d.l}</button>
                      );
                    })}
                  </div>
                </div>

                {/* ── Sub-category Filter Row ── */}
                {subCategories.length > 1 && !search && (() => {
                  const catStyle = getCategoryStyles(activeCategory);
                  return (
                    <div className="relative -mx-4 px-4 overflow-hidden mt-1">
                      <div className="absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-[#EDE8DD] to-transparent pointer-events-none z-10" />
                      <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-[#EDE8DD] to-transparent pointer-events-none z-10" />
                      
                      <div className="overflow-x-auto hide-scrollbar flex gap-2 pt-2.5 pb-1.5 px-4">
                        <div className="shrink-0 flex items-center gap-1 text-[10px] font-bold tracking-[0.12em] uppercase mr-1 select-none" style={{ color: catStyle.iconColor }}>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3">
                            <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/>
                            <line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
                          </svg>
                          Type
                        </div>
                        <button
                          className="shrink-0 text-[10px] px-3.5 py-2 uppercase tracking-[0.12em] font-bold transition-all haptic-light select-none"
                          style={{
                            borderRadius: 'var(--r-btn)',
                            background: subCat === "all" ? catStyle.activePillBg : 'var(--glass-bg)',
                            border: subCat === "all" ? '1px solid transparent' : '1px solid rgba(28,18,8,0.08)',
                            color: subCat === "all" ? '#ffffff' : catStyle.iconColor,
                            boxShadow: subCat === "all" ? `0 4px 12px ${catStyle.glow}` : 'var(--glass-shadow)',
                            transform: subCat === "all" ? 'scale(1.04)' : 'scale(1)'
                          }}
                          onClick={() => setSubCat("all")}
                        >All</button>
                        {subCategories.map(c => (
                          <button
                            key={c.id}
                            className="shrink-0 text-[10px] px-3.5 py-2 uppercase tracking-[0.12em] font-bold transition-all haptic-light select-none"
                            style={{
                              borderRadius: 'var(--r-btn)',
                              background: subCat === c.id ? catStyle.activePillBg : 'var(--glass-bg)',
                              border: subCat === c.id ? '1px solid transparent' : '1px solid rgba(28,18,8,0.08)',
                              color: subCat === c.id ? '#ffffff' : catStyle.iconColor,
                              boxShadow: subCat === c.id ? `0 4px 12px ${catStyle.glow}` : 'var(--glass-shadow)',
                              transform: subCat === c.id ? 'scale(1.04)' : 'scale(1)'
                            }}
                            onClick={() => setSubCat(c.id)}
                          >{c.label}</button>
                        ))}
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}
          </div>

          {layoutMode === 'showcase' ? (
            <ShowcaseScroll items={filtered} onSelect={setDetailItem} />
          ) : (
          <div className="p-4" role="list">
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-espresso-400 animate-fade-in">
                <div className="w-20 h-20 mb-4 rounded-full bg-espresso-100/60 flex items-center justify-center">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" className="w-10 h-10 opacity-40"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/><path d="M8 11h6"/></svg>
                </div>
                <p className="font-semibold text-center px-8 text-espresso-600">Nothing matches that search</p>
                <p className="text-sm text-espresso-400 mt-1 text-center px-8">Try a different keyword or browse by category</p>
                <button className="mt-4 text-brown-600 text-sm font-bold px-5 py-2 rounded-full bg-brown-5 border border-brown-100 hover:bg-brown-100 transition-colors haptic-light" onClick={()=>{setSearch("");setDietary("all");setSubCat("all");}}>Reset All Filters</button>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                {filtered.map((item, index) => (
                  <div 
                    key={item.id} 
                    role="listitem" 
                    className={`p-3.5 flex gap-4 cursor-pointer group relative transition-all duration-300 active:scale-[0.98] ${!mounted.current ? 'animate-rise-card' : 'opacity-100'}`}
                    style={{
                      borderRadius: '24px',
                      background: 'linear-gradient(160deg, #FFFFFF 0%, var(--s-card) 100%)',
                      border: '1px solid rgba(160, 120, 90, 0.12)',
                      boxShadow: '0 1px 2px rgba(28,18,8,0.04), 0 10px 26px -14px rgba(28,18,8,0.20)',
                      animationDelay: `${Math.min(index * 50, 400)}ms`,
                      animationFillMode: 'forwards'
                    }}
                    onClick={() => setDetailItem(item)}
                  >
                    {/* Left gold border highlight on hover */}
                    <div className="absolute left-0 top-6 bottom-6 w-[3px] bg-gradient-to-b from-[#D9AE63] to-[#B58A44] rounded-r-md opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

                    <div 
                      className="shrink-0 overflow-hidden relative"
                      style={{ width: '108px', height: '108px', aspectRatio: '1/1', borderRadius: '18px', boxShadow: '0 4px 14px -4px rgba(28,18,8,0.22)', border: '1px solid rgba(160,120,90,0.12)' }}
                    >
                      {!item.inStock && (
                        <div 
                          className="absolute inset-0 z-10 flex flex-col items-center justify-center p-2 text-center"
                          style={{ 
                            background: 'rgba(247,243,235,0.85)', 
                            backdropFilter: 'blur(5px)', 
                            borderRadius: '18px' 
                          }}
                        >
                          <span className="text-espresso-800 font-display text-[9px] font-bold tracking-widest leading-tight">OUT OF</span>
                          <span className="text-[#B58A44] font-display text-[9px] font-bold tracking-widest leading-tight">STOCK</span>
                        </div>
                      )}
                      <img 
                        src={item.imageUrl} 
                        alt={item.name} 
                        loading="lazy" 
                        className="w-full h-full object-cover transition-all duration-700 ease-out group-hover:scale-105 group-hover:saturate-[1.06]"
                        style={{ 
                          filter: !item.inStock ? 'grayscale(90%) brightness(0.92)' : 'none'
                        }}
                      />
                      
                      {/* Diet badges inside image bottom corner */}
                      {item.foodType !== 'none' && item.foodType && (
                        <div className="absolute bottom-1.5 left-1.5 z-10">
                          <div className={`w-5 h-5 rounded-[4px] border flex items-center justify-center shadow-sm backdrop-blur-sm ${
                            item.foodType === 'veg' 
                              ? 'border-green-600/30 bg-green-50/90' 
                              : 'border-red-600/30 bg-red-50/90'
                          }`}>
                            <div className={`w-1.5 h-1.5 rounded-full ${
                              item.foodType === 'veg' ? 'bg-green-600' : 'bg-red-600'
                            }`} />
                          </div>
                        </div>
                      )}
                    </div>
                    
                    <div className="flex-1 py-0.5 flex flex-col justify-center min-w-0">
                      <div className="flex justify-between items-start gap-1">
                        <span className="font-sans text-[10px] font-bold uppercase tracking-[0.15em] mb-1 text-[#B58A44]">{item.subCategoryLabel}</span>
                        {item.flavorProfile?.includes('spicy') && (
                          <span className="text-[9px] font-bold text-red-500 uppercase tracking-widest bg-red-50 border border-red-100 px-1.5 py-0.5 rounded-md">Spicy</span>
                        )}
                      </div>
                      
                      <div className={`font-sans text-[16px] font-semibold leading-[1.25] mb-2 line-clamp-2 ${!item.inStock ? 'text-espresso-400' : 'text-espresso-900 group-hover:text-[#B58A44] transition-colors'}`}>
                        {item.name}
                      </div>
                      
                      <div className="mt-auto flex items-end justify-between w-full">
                        <div className="flex items-baseline gap-1">
                          <span className="font-price text-[11px] font-light text-espresso-500 tracking-wide">Rs.</span>
                          <span className="font-price text-xl font-bold text-espresso-950 tracking-tight">{item.price}</span>
                        </div>
                        {item.inStock && (
                          <button
                            className="w-10 h-10 rounded-full flex items-center justify-center -mr-1 -mb-1 text-espresso-950 transition-all duration-300 hover:scale-105 active:scale-90"
                            style={{ 
                              background: 'linear-gradient(150deg, #D9AE63 0%, #B58A44 100%)', 
                              boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.4), 0 3px 10px -3px rgba(140,101,45,0.55)' 
                            }}
                            onClick={(e) => {
                              e.stopPropagation();
                              addToCart(item, 1);
                              haptic('medium');
                              setAddedId(item.id);
                              setTimeout(() => setAddedId(null), 1000);
                            }}
                            aria-label="Add to cart"
                            title="Add to cart"
                          >
                            {addedId === item.id ? (
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="w-4 h-4 text-espresso-950 animate-fade-in"><polyline points="20 6 9 17 4 12"></polyline></svg>
                            ) : (
                              <Icons.Plus className="w-4.5 h-4.5" strokeWidth="2.5" />
                            )}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          )}
        </div>
      );
    });
    // ─── Sheet Components ───
    const ItemDetailSheet = memo(({ item, onClose, addToCart, menuData }) => {
      const [qty, setQty] = useState(1);
      const [isClosing, setIsClosing] = useState(false);
      const [added, setAdded] = useState(false);
      const sheetRef = useRef(null);
      const [selectedPairs, setSelectedPairs] = useState([]);
      
      const pairings = useMemo(() => {
        if (!item) return [];
        return (PAIRING_MATRIX[item.subCategory] || [])
          .slice(0,2)
          .map(n => menuData.find(m => m.name === n))
          .filter(Boolean);
      }, [item, menuData]);

      const shareItem = () => {
        haptic('light');
        if (navigator.share) {
          navigator.share({ title: item.name, text: `Check out ${item.name} at Satkar Cafe!`, url: window.location.href }).catch(()=>{});
        } else {
          const text = encodeURIComponent(`Check out ${item.name} at Satkar Cafe! Rs. ${item.price} - ${window.location.href}`);
          window.open(`https://wa.me/?text=${text}`, '_blank');
        }
      };
      


      return (
        <div 
          className="fixed inset-0 z-[10000] flex items-center justify-center" 
          role="dialog" 
          aria-modal="true" 
          aria-label={item.name}
        >
          {/* Immersive Backdrop */}
          <div 
            className={`absolute inset-0 ${isClosing ? 'animate-immersive-close' : 'animate-backdrop-reveal'}`}
            style={{ 
              background: 'rgba(28, 18, 8, 0.6)',
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)'
            }}
            onClick={() => { setIsClosing(true); setTimeout(onClose, 250); }}
          />
          
          {/* Immersive Sheet — scale-fade instead of slide-up */}
          <div 
            ref={sheetRef}
            className={`relative w-full max-w-md mx-auto flex flex-col pt-0 sm:mb-4 max-h-[92vh] overflow-y-auto hide-scrollbar scrollable-area overscroll-contain ${isClosing ? 'animate-immersive-close' : 'animate-immersive-open'}`}
            style={{ 
              background: 'var(--s-sheet)',
              borderRadius: 'var(--r-sheet)',
              boxShadow: '0 20px 60px rgba(28, 18, 8, 0.35), 0 8px 24px rgba(28, 18, 8, 0.15)',
              margin: 'auto 1rem'
            }}
          >
            {/* Image with shared element transition effect */}
            <div 
              className="relative w-full shrink-0 overflow-hidden"
              style={{ aspectRatio: '4/5', maxHeight: '50vh' }}
            >
              <img 
                key={item.id} 
                src={item.imageUrl} 
                alt={item.name} 
                className={`w-full h-full object-cover transition-all duration-500 ease-out ${!item.inStock ? 'grayscale opacity-60' : ''} ${isClosing ? 'scale-90 opacity-0' : 'scale-100 opacity-100'}`}
                style={{ 
                  transformOrigin: 'center',
                  animation: 'itemImageScale 500ms cubic-bezier(0.34, 1.56, 0.64, 1) forwards'
                }}
              />
              <style>{`
                @keyframes itemImageScale {
                  from { transform: scale(0.92); opacity: 0; }
                  to { transform: scale(1); opacity: 1; }
                }
              `}</style>
              {/* Mesh gradient overlays */}
              <div 
                className="absolute inset-0"
                style={{ background: 'linear-gradient(0deg, rgba(28,18,8,0.9) 0%, rgba(28,18,8,0.35) 40%, transparent 70%)' }}
              />
              <div 
                className="absolute inset-0"
                style={{ background: 'linear-gradient(180deg, rgba(28,18,8,0.35) 0%, transparent 25%)' }}
              />
              
              {/* Glassmorphic close button */}
              <button 
                className="absolute top-4 right-4 w-11 h-11 flex items-center justify-center text-white haptic-light"
                aria-label="Close" 
                onClick={() => { setIsClosing(true); setTimeout(onClose, 200); }}
                style={{ 
                  background: 'rgba(28, 18, 8, 0.85)',
                  backdropFilter: 'blur(16px) saturate(180%)',
                  WebkitBackdropFilter: 'blur(16px) saturate(180%)',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  borderRadius: 'var(--r-btn)',
                  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)'
                }}
              >
                <Icons.X className="w-5 h-5 text-white/90" strokeWidth="2" />
              </button>
              
              {/* Tags */}
              <div className="absolute bottom-4 left-4 right-4 flex gap-2 flex-wrap">
                {!item.inStock && (
                  <span 
                    className="text-white font-sans text-[9px] font-bold tracking-[0.14em] uppercase px-3 py-1.5"
                    style={{ background: 'rgba(168,66,50,0.92)', borderRadius: 'var(--r-tag)' }}
                  >Sold Out</span>
                )}
                {item.foodType !== 'none' && item.foodType && (
                <span 
                  className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-semibold"
                  style={{ 
                    background: item.foodType === 'veg' ? 'rgba(74,117,80,0.18)' : 'rgba(168,66,50,0.18)',
                    backdropFilter: 'blur(8px)',
                    border: item.foodType === 'veg' ? '1px solid rgba(74,117,80,0.3)' : '1px solid rgba(168,66,50,0.3)',
                    borderRadius: 'var(--r-tag)',
                    color: item.foodType === 'veg' ? '#5a8f60' : '#c45242'
                  }}
                >
                  <span className="w-2 h-2 rounded-full" style={{ background: item.foodType === 'veg' ? 'var(--veg)' : 'var(--nonveg)' }}></span>
                  {item.foodType === 'veg' ? 'Veg' : 'Non-Veg'}
                </span>
                )}
                {item.flavorProfile.includes('spicy') && (
                  <span 
                    className="flex items-center gap-1 px-3 py-1.5 text-[10px] font-semibold"
                    style={{ 
                      borderRadius: 'var(--r-tag)', 
                      background: 'rgba(160, 120, 90,0.22)',
                      backdropFilter: 'blur(8px)',
                      border: '1px solid rgba(160, 120, 90,0.35)',
                      color: '#8A6010' 
                    }}
                  >
                    Spicy
                  </span>
                )}
                {item.isSignatureItem && (
                  <span 
                    className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-semibold"
                    style={{ 
                      borderRadius: 'var(--r-tag)',
                      background: 'linear-gradient(135deg, rgba(160, 120, 90,0.25) 0%, rgba(160, 120, 90,0.15) 100%)',
                      border: '1px solid rgba(160, 120, 90,0.35)',
                      color: '#8A6010'
                    }}
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-brown-500 animate-pulse"></span>
                    Signature
                  </span>
                )}
              </div>
            </div>
            
            {/* Content Area */}
            <div 
              className="px-6 py-6 pb-32"
              style={{ background: 'var(--s-sheet)' }}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="font-sans text-[10px] font-medium uppercase tracking-wide text-espresso-400">{item.category} • {item.subCategoryLabel}</span>
                <button 
                  aria-label="Share Item" 
                  onClick={shareItem} 
                  className="glass-card w-9 h-9 flex items-center justify-center haptic-light"
                  style={{ borderRadius: 'var(--r-btn)' }}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-espresso-600"><circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line></svg>
                </button>
              </div>
              <div className="mb-4">
                <h2 
                  className="font-display text-[2rem] font-normal leading-[1.1] tracking-[-0.025em] text-espresso-950 mb-2"
                  style={{ fontVariationSettings: "'wght' 400, 'opsz' 144" }}
                >{item.name}</h2>
                <div className="flex items-baseline gap-1">
                  <span 
                    className="font-price text-[11px] font-light text-espresso-500"
                    style={{ verticalAlign: 'text-top', position: 'relative', top: '2px' }}
                  >Rs.</span>
                  <span className="font-price text-[24px] font-extrabold text-espresso-900 tracking-[-0.02em]">{item.price}</span>
                </div>
              </div>
              
              <p className="font-sans text-[14px] font-normal leading-[1.7] text-espresso-600 mb-6">{item.description}</p>
              
              <div className="flex gap-2 mb-8 flex-wrap">
                <div 
                  className="glass-card flex items-center gap-1 px-3.5 py-2 text-[11px] font-medium capitalize"
                  style={{ borderRadius: 'var(--r-tag)' }}
                >
                  <svg viewBox="0 0 24 24" fill="none" className="w-3.5 h-3.5 mr-1" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                  {prepTimeMinutes(item.prepTime)}
                </div>
                {item.flavorProfile.map(f => (
                  <div 
                    key={f} 
                    className="glass-card px-3.5 py-2 text-[11px] font-semibold capitalize flex items-center gap-1"
                    style={{ borderRadius: 'var(--r-tag)' }}
                  >{f}</div>
                ))}
              </div>

              {pairings.length > 0 && (
                <div className="mb-8">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="font-sans text-[10px] font-semibold tracking-[0.14em] uppercase text-espresso-400">Pairs well with</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    {pairings.map(p => {
                      const isSelected = selectedPairs.some(sp => sp.id === p.id);
                      return (
                        <div 
                          key={p.id} 
                          role="button" 
                          aria-label={`Toggle ${p.name}`} 
                          className="relative flex items-center gap-3 haptic-light cursor-pointer p-3 transition-all duration-200 active:scale-[0.98]"
                          style={{
                            borderRadius: 'var(--r-card)',
                            background: isSelected ? 'linear-gradient(160deg, rgba(217,174,99,0.16) 0%, rgba(181,138,68,0.10) 100%)' : 'linear-gradient(160deg, #FFFFFF 0%, var(--s-card) 100%)',
                            border: isSelected ? '1px solid rgba(160, 120, 90, 0.45)' : '1px solid rgba(160, 120, 90, 0.12)',
                            boxShadow: isSelected ? '0 2px 6px rgba(140,101,45,0.18), 0 8px 20px -12px rgba(140,101,45,0.4)' : '0 1px 2px rgba(28,18,8,0.04), 0 8px 20px -14px rgba(28,18,8,0.16)'
                          }}
                          onClick={() => {
                            haptic('light');
                            if (isSelected) {
                              setSelectedPairs(prev => prev.filter(sp => sp.id !== p.id));
                            } else {
                              setSelectedPairs(prev => [...prev, p]);
                            }
                          }}
                        >
                          {isSelected && (
                            <div className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-brown-500 text-white rounded-full flex items-center justify-center shadow-md z-10" style={{ background: '#8B6347' }}>
                              <Icons.Check className="w-3 h-3" strokeWidth="3" />
                            </div>
                          )}
                          <img src={p.imageUrl} alt="" className="w-12 h-12 object-cover shrink-0" style={{ borderRadius: '12px', aspectRatio: '1/1', boxShadow: '0 3px 10px -3px rgba(28,18,8,0.3)', border: '1px solid rgba(160,120,90,0.15)' }} />
                          <div className="min-w-0">
                            <div className="font-sans text-[12px] font-semibold leading-[1.3] text-espresso-900 line-clamp-2">{p.name}</div>
                            <div className="flex items-baseline gap-0.5 mt-0.5">
                              <span className="font-price text-[10px] text-espresso-500">+ Rs.</span>
                              <span className="font-price text-[13px] font-bold text-espresso-800">{p.price}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Sticky bottom bar with glassmorphic styling */}
            <div 
              className="sticky bottom-0 w-full p-4 flex gap-4 z-50"
              style={{ 
                background: 'var(--glass-bg)',
                backdropFilter: 'var(--glass-blur)',
                WebkitBackdropFilter: 'var(--glass-blur)',
                borderTop: '1px solid var(--glass-border)',
                boxShadow: '0 -4px 24px rgba(28, 18, 8, 0.08)'
              }}
            >
              {/* Quantity selector with spring physics */}
              <div 
                className="glass-card flex items-center p-1.5 w-36 shrink-0"
                style={{ borderRadius: 'var(--r-card)' }}
              >
                <button 
                  className="w-11 h-11 flex items-center justify-center haptic-medium" 
                  style={{ borderRadius: '14px', color: qty === 1 ? '#d1c7b8' : '#6b5b4f' }}
                  disabled={qty===1} 
                  aria-disabled={qty===1} 
                  onClick={()=>{haptic('light');setQty(q=>q-1)}} 
                  aria-label="Decrease"
                ><Icons.Minus className="w-4 h-4" strokeWidth="2.5" /></button>
                <div className="flex-1 text-center">
                  <span 
                    className="font-sans text-[18px] font-bold text-espresso-950"
                    style={{ fontVariantNumeric: 'tabular-nums' }}
                  >{qty}</span>
                </div>
                <button
                  className="w-11 h-11 flex items-center justify-center text-espresso-950 haptic-medium active:scale-90 transition-transform"
                  style={{ borderRadius: '14px', background: 'linear-gradient(150deg, #D9AE63 0%, #B58A44 100%)', boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.4), 0 2px 8px -2px rgba(140,101,45,0.5)' }}
                  onClick={()=>{haptic('light');setQty(q=>q+1)}}
                  aria-label="Increase"
                ><Icons.Plus className="w-4 h-4" strokeWidth="3" /></button>
              </div>
              
              {item.inStock ? (
                <button 
                  className="btn-primary flex-1 py-4 transition-all duration-300"
                  style={{ 
                    fontSize: '15px',
                    background: added ? 'linear-gradient(135deg, #3a7d44 0%, #2d6236 100%)' : undefined
                  }}
                  onClick={(e) => { 
                    if (added) return;
                    addToCart(item, qty, e); 
                    selectedPairs.forEach(p => addToCart(p, 1, e));
                    haptic('success');
                    setAdded(true);
                    setTimeout(() => { onClose(); setAdded(false); }, 850);
                  }}
                >
                  {added ? (
                    <span className="flex items-center justify-center gap-2 animate-fade-in">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-4 h-4"><polyline points="20 6 9 17 4 12"></polyline></svg>
                      Added!
                    </span>
                  ) : (
                    <>Add to Order — <span className="font-normal">Rs.</span> <span className="font-bold">{(item.price * qty) + selectedPairs.reduce((sum, p) => sum + p.price, 0)}</span></>
                  )}
                </button>
              ) : (
                <button 
                  className="flex-1 py-4 font-bold flex items-center justify-center gap-2 haptic-light"
                  style={{ 
                    background: 'linear-gradient(135deg, rgba(168,66,50,0.12) 0%, rgba(168,66,50,0.08) 100%)',
                    color: 'var(--error-text)',
                    border: '1px solid var(--error-border)',
                    borderRadius: 'var(--r-card)'
                  }}
                  onClick={()=>{
                    haptic('light');
                    __db.collection('waitlist').add({ itemId: item.id, itemName: item.name, sessionId: __sessionId, timestamp: new Date().toISOString() }).then(() => {
                      showToast("We'll notify you when it's back!");
                    }).catch(() => { showToast("Waitlist saved locally.", "error"); });
                    onClose();
                  }}
                >
                  Notify Me <Icons.Bell className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </div>
      );
    });

    const OrderStatusSheet = memo(({ orderId, onClose }) => {
      const { order, error, itemCount } = useOrderStatus(orderId, onClose);
      const sheetRef = useRef(null);
      
      // Show loading state initially
      const isLoading = !order && !error;

      const steps = [
        { key: 'pending', label: 'Received', icon: 'M20 6L9 17l-5-5' },
        { key: 'preparing', label: 'Preparing', icon: 'M12 2L2 7l10 5 10-5-10-5z M2 17l10 5 10-5 M2 12l10 5 10-5' },
        { key: 'ready', label: 'Ready', icon: 'M22 11.08V12a10 10 0 1 1-5.93-9.14 M22 4 12 14.01 9 11.01' },
        { key: 'done', label: 'Done', icon: 'M20 6 9 17l-5-5' }
      ];
      
      const currentStepIndex = steps.findIndex(s => s.key === (order?.status || 'pending'));
      
      // Format timestamp
      const timeStr = order?.timestamp 
        ? new Date(order.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
        : '--:--';

      return (
        <div 
          className="fixed inset-0 z-[8500] flex items-end"
          role="dialog"
          aria-modal="true"
          aria-label="Order Status"
        >
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-black/50"
            style={{ backdropFilter: 'blur(4px)' }}
          />
          
          {/* Sheet */}
          <div 
            ref={sheetRef}
            className="relative w-full max-w-md mx-auto animate-rise-heavy"
            style={{ 
              background: 'var(--dark-glass-bg)',
              backdropFilter: 'var(--glass-blur)',
              WebkitBackdropFilter: 'var(--glass-blur)',
              border: '1px solid var(--dark-glass-border)',
              borderRadius: 'var(--r-sheet) var(--r-sheet) 0 0',
              boxShadow: '0 -8px 48px rgba(0,0,0,0.3)',
              paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom))'
            }}
          >
            {/* Drag Handle */}
            <div 
              className="absolute top-3 left-1/2 -translate-x-1/2"
              style={{ width: '48px', height: '5px', background: 'rgba(255,255,255,0.2)', borderRadius: '3px' }}
            />
            
            <div className="p-6 pt-8">
              {/* Header */}
              <div className="flex items-center gap-3 mb-6">
                <div 
                  className="w-12 h-12 rounded-full flex items-center justify-center"
                  style={{ background: 'linear-gradient(135deg, rgba(160, 120, 90,0.3) 0%, rgba(160, 120, 90,0.1) 100%)' }}
                >
                  <svg viewBox="0 0 24 24" fill="none" className="w-6 h-6 text-brown-400" stroke="currentColor" strokeWidth="1.5">
                    <path d="M9 12l2 2 4-4"/><circle cx="12" cy="12" r="10"/>
                  </svg>
                </div>
                <div>
                  <h3 className="font-display text-xl text-white">Order Status</h3>
                  <p className="text-[12px] text-espresso-400">{isLoading ? 'Connecting...' : `Placed at ${timeStr}`}</p>
                </div>
              </div>

              {/* Loading State */}
              {isLoading && (
                <div className="flex items-center justify-center py-8">
                  <div className="flex gap-1.5">
                    {[0,1,2].map(i => (
                      <div 
                        key={i}
                        className="w-2 h-2 rounded-full bg-brown-500/50 animate-pulse"
                        style={{ animationDelay: `${i * 0.15}s` }}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Error State */}
              {error && !isLoading && (
                <div className="text-center py-4 mb-4">
                  <p className="text-[14px] text-espresso-400">Checking your order...</p>
                </div>
              )}

              {/* Progress Track */}
              {!isLoading && !error && (
                <div className="mb-6">
                  <div className="flex items-center justify-between relative">
                    {/* Progress Line */}
                    <div 
                      className="absolute top-4 left-0 right-0 h-0.5"
                      style={{ background: 'rgba(255,255,255,0.1)' }}
                    />
                    <div 
                      className="absolute top-4 left-0 h-0.5 transition-all duration-500"
                      style={{ 
                        background: 'linear-gradient(90deg, #E8C56A, #C8950F)',
                        width: `${(currentStepIndex / (steps.length - 1)) * 100}%`
                      }}
                    />
                    
                    {steps.map((step, idx) => {
                      const isActive = idx <= currentStepIndex;
                      const isCurrent = idx === currentStepIndex;
                      
                      return (
                        <div key={step.key} className="flex flex-col items-center relative z-10">
                          <div 
                            className={`w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300 ${
                              isActive 
                                ? 'bg-brown-500 text-espresso-950' 
                                : 'bg-espresso-800 text-espresso-500'
                            } ${isCurrent ? 'ring-2 ring-brown-400 ring-offset-2 ring-offset-espresso-950' : ''}`}
                          >
                            <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4" stroke="currentColor" strokeWidth="2">
                              <path d={step.icon}/>
                            </svg>
                          </div>
                          <span 
                            className={`text-[10px] mt-2 font-semibold uppercase tracking-wider transition-colors ${
                              isActive ? 'text-brown-400' : 'text-espresso-500'
                            }`}
                          >
                            {step.label}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Order Details */}
              {!isLoading && !error && order && (
                <div 
                  className="p-4 rounded-2xl mb-4"
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}
                >
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-[12px] text-espresso-400 uppercase tracking-wider">Order ID</span>
                    <span className="text-[12px] text-white font-mono">
                      {order.id ? order.id.slice(-8) : orderId?.slice(-8) || '--'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-[12px] text-espresso-400 uppercase tracking-wider">Items</span>
                    <span className="text-[12px] text-white">{itemCount}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-[12px] text-espresso-400 uppercase tracking-wider">Total</span>
                    <span className="text-[14px] text-brown-400 font-bold">Rs. {order.total || 0}</span>
                  </div>
                </div>
              )}

              {/* Status Message */}
              {!isLoading && !error && order && (
                <div className="text-center">
                  <p className="text-[14px] text-white/80">
                    {(order.status === 'pending' || !order.status) && "We've received your order!"}
                    {order.status === 'preparing' && "Our chefs are preparing your food..."}
                    {order.status === 'ready' && "Your order is ready for pickup!"}
                    {order.status === 'done' && "Enjoy your meal!"}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      );
    });

    const CartSheet = memo(({ isOpen, onClose, cart, placeOrder }) => {
      const sheetRef = useRef(null);
      const [note, setNote] = useState("");
      const [isClosing, setIsClosing] = useState(false);
      const [dragX, setDragX] = useState(0);
      const [isDragging, setIsDragging] = useState(false);
      const [slideProgress, setSlideProgress] = useState(0);
      const [whatsappOpened, setWhatsappOpened] = useState(false);
      const slideRef = useRef(null);
      const startX = useRef(0);
      
      useBottomSheet(isOpen, () => {
        setIsClosing(true);
        setTimeout(onClose, 200);
      }, sheetRef);
      
      const subtotal = cart.total;
      const sCharge = Math.round(cart.total * SERVICE_CHARGE_RATE);
      const grandTotal = subtotal + sCharge;
      
      // Slide-to-confirm handlers
      const handleSlideStart = (e) => {
        setIsDragging(true);
        startX.current = e.type.includes('touch') ? e.touches[0].clientX : e.clientX;
      };
      
      const handleSlideMove = (e) => {
        if (!isDragging || !slideRef.current) return;
        const currentX = e.type.includes('touch') ? e.touches[0].clientX : e.clientX;
        const diff = Math.max(0, currentX - startX.current);
        const maxSlide = slideRef.current.offsetWidth - 80;
        const progress = Math.min(diff / maxSlide, 1);
        setSlideProgress(progress);
        setDragX(diff);
      };
      
      const handleSlideEnd = () => {
        setIsDragging(false);
        if (slideProgress > 0.85) {
          setSlideProgress(1);
          setWhatsappOpened(true);
          placeOrder(note);
        } else {
          setSlideProgress(0);
          setDragX(0);
        }
      };

      return (
        <div 
          className="fixed inset-0 z-[10000] flex items-end" 
          role="dialog" 
          aria-modal="true" 
          aria-label="Your Order"
        >
          {/* Backdrop */}
          <div 
            className={`absolute inset-0 transition-opacity duration-300 ${isClosing ? 'opacity-0' : 'opacity-100'}`}
            style={{ 
              background: 'rgba(28, 18, 8, 0.45)',
              backdropFilter: 'blur(10px)',
              WebkitBackdropFilter: 'blur(10px)'
            }}
            onClick={() => { setIsClosing(true); setTimeout(onClose, 200); }}
          />
          
          {/* Sheet with spring physics */}
          <div 
            ref={sheetRef}
            className={`relative w-full max-w-md mx-auto flex flex-col ${isClosing ? 'animate-slide-down' : 'animate-spring-sheet'} sm:mb-4 h-[88vh]`}
            style={{ 
              background: 'var(--s-sheet)',
              borderRadius: 'var(--r-sheet) var(--r-sheet) 0 0',
              boxShadow: '0 -8px 48px rgba(28, 18, 8, 0.12), 0 -24px 80px rgba(28, 18, 8, 0.08)'
            }}
          >
            {/* Drag Handle */}
            <div 
              className="absolute top-3 left-1/2 -translate-x-1/2 z-20"
              style={{ 
                width: '48px', 
                height: '5px', 
                background: 'rgba(28, 18, 8, 0.12)',
                borderRadius: '3px'
              }}
            />
            
            {/* Sticky Header */}
            <div 
              className="p-6 pt-8 flex justify-between items-center shrink-0 sticky top-0 z-20"
              style={{ 
                background: 'var(--glass-bg)',
                backdropFilter: 'var(--glass-blur)',
                WebkitBackdropFilter: 'var(--glass-blur)',
                borderBottom: '1px solid var(--glass-border)',
                borderRadius: 'var(--r-sheet) var(--r-sheet) 0 0'
              }}
            >
              <h2 
                className="font-display text-[2rem] font-normal text-espresso-950"
                style={{ fontVariationSettings: "'wght' 400, 'opsz' 144" }}
              >Your Order</h2>
              <div className="flex items-center gap-2">
                {cart.cart.length > 0 && (
                  <button 
                    className="text-[10px] font-bold uppercase tracking-wider text-espresso-400 px-3 py-1.5 rounded-full border border-espresso-200 hover:text-red-500 hover:border-red-200 transition-colors haptic-light"
                    onClick={() => { haptic('medium'); cart.clearCart(); }}
                    aria-label="Clear all items"
                  >Clear All</button>
                )}
                <button 
                  className="glass-card w-11 h-11 flex items-center justify-center shrink-0 haptic-light"
                  style={{ borderRadius: 'var(--r-btn)' }}
                  onClick={() => { setIsClosing(true); setTimeout(onClose, 200); }} 
                  aria-label="Close cart"
                >
                  <Icons.X className="w-5 h-5 text-espresso-600" strokeWidth="2" />
                </button>
              </div>
            </div>
            
            <div 
              className="scrollable-area flex-1 overflow-y-auto px-6 py-4 hide-scrollbar"
              style={{ background: 'var(--s-sheet)' }}
            >
              {whatsappOpened ? (
                <div className="h-full flex flex-col items-center justify-center text-center px-4 animate-fade-in">
                  <div className="glass-card w-24 h-24 flex items-center justify-center mb-5" style={{ borderRadius: '50%' }}>
                    <svg viewBox="0 0 24 24" fill="none" className="w-10 h-10 text-brown-600" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                  </div>
                  <p className="font-display text-2xl text-espresso-900 mb-2">Almost Done!</p>
                  <p className="text-sm text-espresso-500 mb-8 max-w-[260px]">We've opened WhatsApp. Please hit send there to complete your order.</p>
                  <button className="btn-primary w-full py-4 text-[15px] font-bold" onClick={() => { setIsClosing(true); setTimeout(onClose, 200); }}>Close Cart</button>
                </div>
              ) : cart.cart.length === 0 ? (
                <div 
                  className="h-full flex flex-col items-center justify-center text-center"
                  style={{ color: 'rgba(28,18,8,0.35)' }}
                >
                  <div 
                    className="glass-card w-24 h-24 flex items-center justify-center mb-5"
                    style={{ borderRadius: '50%' }}
                  >
                    <Icons.ShoppingCart className="w-10 h-10" strokeWidth="1.5" style={{ color: 'rgba(28,18,8,0.25)' }} />
                  </div>
                  <p 
                    className="font-display text-2xl text-espresso-800/60 mb-2"
                    style={{ fontVariationSettings: "'wght' 350, 'opsz' 144" }}
                  >Your table is set.</p>
                  <p className="text-sm text-espresso-400/60">Just needs food.</p>
                </div>
              ) : (
                <div className="space-y-4 animate-fade-veil">
                  {/* Floating Receipt Header */}
                  <div 
                    className="glass-card p-4 mb-6 transition-all duration-300 hover:scale-[1.01]"
                    style={{ 
                      borderRadius: '18px',
                      background: 'linear-gradient(145deg, rgba(160, 120, 90, 0.08) 0%, rgba(160, 120, 90, 0.03) 100%)',
                      border: '1px dashed rgba(160, 120, 90, 0.25)',
                      boxShadow: '0 4px 20px -8px rgba(160, 120, 90, 0.15)'
                    }}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-6 h-6 rounded-[8px] flex items-center justify-center text-white shrink-0" style={{ background: 'linear-gradient(135deg, #D9AE63 0%, #B58A44 100%)', boxShadow: '0 2px 8px -2px rgba(181, 138, 68, 0.4)' }}>
                        <Icons.ShoppingBag className="w-3.5 h-3.5" strokeWidth="2" />
                      </div>
                      <span className="font-sans text-[10.5px] font-bold tracking-[0.14em] uppercase text-brown-700">Order Receipt</span>
                    </div>
                    <div className="font-sans text-xs text-espresso-600/95 flex items-center gap-1.5">
                      <span>{cart.cart.length} item{cart.cart.length > 1 ? 's' : ''}</span>
                      <span className="text-espresso-300">•</span>
                      <span>Est. prep {Math.max(...cart.cart.map(c => prepTimeNum(c.item.prepTime)))} mins</span>
                    </div>
                  </div>
                  
                  {/* Cart Items */}
                  <div className="space-y-3">
                    {cart.cart.map((c, idx) => (
                      <div
                        key={c.item.id}
                        className="flex gap-4 items-center p-3 haptic-light transition-all duration-200 hover:scale-[1.01]"
                        style={{
                          borderRadius: '20px',
                          background: 'linear-gradient(160deg, rgba(255, 255, 255, 0.95) 0%, rgba(247, 243, 235, 0.9) 100%)',
                          border: '1px solid rgba(160, 120, 90, 0.15)',
                          boxShadow: '0 4px 18px -8px rgba(28, 18, 8, 0.12)',
                          animationDelay: `${idx * 50}ms`
                        }}
                      >
                        <div className="relative group shrink-0 overflow-hidden" style={{ borderRadius: '14px' }}>
                          <img
                            src={c.item.imageUrl}
                            alt=""
                            className="w-16 h-16 object-cover transition-transform duration-300 group-hover:scale-105"
                            style={{ aspectRatio: '1/1', boxShadow: '0 4px 12px -4px rgba(28, 18, 8, 0.3)' }}
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-display text-[15.5px] font-semibold leading-tight mb-1 text-espresso-950 line-clamp-1">{c.item.name}</div>
                          <div className="flex items-baseline gap-0.5">
                            <span className="font-price text-[10px] text-espresso-500">Rs.</span>
                            <span className="font-price text-[14.5px] font-bold text-brown-800">{c.item.price}</span>
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-2 shrink-0">
                          <div 
                            className="glass-card flex items-center p-1 w-26"
                            style={{ 
                              borderRadius: '12px',
                              border: '1px solid rgba(160, 120, 90, 0.2)',
                              background: 'rgba(255, 255, 255, 0.6)'
                            }}
                          >
                            <button 
                              className="w-8 h-8 flex items-center justify-center text-espresso-500 rounded-[9px] hover:bg-espresso-100/50 hover:text-espresso-800 transition-colors haptic-light" 
                              onClick={() => cart.updateQty(c.item.id, -1)} 
                              aria-label="Decrease quantity"
                            ><Icons.Minus className="w-3 h-3" strokeWidth="2.5" /></button>
                            <div className="flex-1 text-center">
                              <span 
                                className="font-sans text-sm font-bold text-espresso-950"
                                style={{ fontVariantNumeric: 'tabular-nums' }}
                              >{c.qty}</span>
                            </div>
                            <button
                              className="w-8 h-8 flex items-center justify-center text-white rounded-[9px] haptic-light active:scale-95 transition-all"
                              style={{ 
                                background: 'linear-gradient(135deg, #D9AE63 0%, #B58A44 100%)', 
                                boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.4), 0 2px 8px -2px rgba(181, 138, 68, 0.4)' 
                              }}
                              onClick={() => cart.updateQty(c.item.id, 1)}
                              aria-label="Increase quantity"
                            ><Icons.Plus className="w-3 h-3" strokeWidth="3" /></button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  
                  {/* Special Instructions with Quick Tags */}
                  <div className="mt-8 pt-6" style={{ borderTop: '1px solid rgba(28,18,8,0.08)' }}>
                    <div className="flex items-center justify-between mb-2">
                      <label className="font-sans text-[10px] font-bold tracking-[0.12em] uppercase text-brown-700">Special Instructions</label>
                      <span className="font-sans text-[9px] font-medium text-espresso-400/80">{note.length}/120</span>
                    </div>
                    
                    {/* Quick Instruction Tags */}
                    <div className="flex gap-2 overflow-x-auto pb-3 pt-1 hide-scrollbar -mx-1 px-1">
                      {[
                        "Less Spicy",
                        "No Onion/Garlic",
                        "Pack Separately",
                        "Spicy",
                        "Extra Cutlery"
                      ].map((tag) => {
                        const isSelected = note.includes(tag);
                        return (
                          <button
                            key={tag}
                            type="button"
                            onClick={() => {
                              haptic('light');
                              setNote(prev => {
                                if (prev.includes(tag)) {
                                  const regex = new RegExp(prev.includes(tag + ', ') ? tag + ', ' : (prev.includes(', ' + tag) ? ', ' + tag : tag), 'g');
                                  const cleaned = prev.replace(regex, '').trim();
                                  return cleaned;
                                } else {
                                  const separator = prev.trim() ? ', ' : '';
                                  const nextVal = prev.trim() + separator + tag;
                                  return nextVal.slice(0, 120);
                                }
                              });
                            }}
                            className="shrink-0 text-[11px] font-semibold px-3 py-1.5 rounded-full transition-all duration-200 border cursor-pointer select-none"
                            style={{
                              background: isSelected 
                                ? 'linear-gradient(135deg, rgba(217, 174, 99, 0.15) 0%, rgba(181, 138, 68, 0.15) 100%)' 
                                : 'rgba(255, 255, 255, 0.6)',
                              borderColor: isSelected 
                                ? 'rgba(181, 138, 68, 0.4)' 
                                : 'rgba(160, 120, 90, 0.15)',
                              color: isSelected 
                                ? 'rgb(140, 101, 45)' 
                                : 'rgb(90, 70, 55)',
                              boxShadow: isSelected
                                ? '0 2px 8px -2px rgba(181, 138, 68, 0.15)'
                                : 'none'
                            }}
                          >
                            {tag}
                          </button>
                        );
                      })}
                    </div>

                    <textarea 
                      value={note} 
                      onChange={e=>setNote(e.target.value)} 
                      maxLength={120} 
                      placeholder="Allergies, less spicy, pack separately, etc..." 
                      className="w-full p-3.5 text-sm resize-none h-20 text-espresso-950 focus:outline-none placeholder:text-espresso-400/60"
                      style={{ 
                        background: 'rgba(255, 255, 255, 0.65)', 
                        border: '1px solid rgba(160, 120, 90, 0.2)', 
                        borderRadius: 'var(--r-card)',
                        boxShadow: 'inset 0 1px 2px rgba(28, 18, 8, 0.03)',
                        transition: 'all var(--t-snap)'
                      }}
                      onFocus={e => { 
                        e.target.style.borderColor = 'rgba(181, 138, 68, 0.5)'; 
                        e.target.style.boxShadow = '0 0 0 3px rgba(181, 138, 68, 0.12), inset 0 1px 2px rgba(28, 18, 8, 0.03)'; 
                        e.target.style.background = 'rgba(255, 255, 255, 0.9)';
                      }}
                      onBlur={e => { 
                        e.target.style.borderColor = 'rgba(160, 120, 90, 0.2)'; 
                        e.target.style.boxShadow = 'inset 0 1px 2px rgba(28, 18, 8, 0.03)'; 
                        e.target.style.background = 'rgba(255, 255, 255, 0.65)';
                      }}
                    />
                  </div>

                  {/* Floating Receipt Summary */}
                  <div 
                    className="mt-4 p-5 text-sm glass-card transition-all duration-300"
                    style={{ 
                      borderRadius: 'var(--r-card)',
                      background: 'linear-gradient(180deg, rgba(255, 255, 255, 0.8) 0%, rgba(247, 243, 235, 0.7) 100%)',
                      border: '1px solid rgba(160, 120, 90, 0.18)',
                      boxShadow: '0 8px 32px -16px rgba(28, 18, 8, 0.12)'
                    }}
                  >
                    <div className="flex justify-between mb-3 text-espresso-700 font-semibold">
                      <span>Subtotal</span>
                      <span className="flex items-baseline gap-1 font-price">
                        <span className="text-[10px]">Rs.</span>
                        <span className="font-bold text-espresso-950">{subtotal}</span>
                      </span>
                    </div>
                    <div className="flex justify-between mb-3 text-espresso-700 font-semibold pb-3" style={{ borderBottom: '1px dashed rgba(160, 120, 90, 0.25)' }}>
                      <span>Service Charge (10%)</span>
                      <span className="flex items-baseline gap-1 font-price">
                        <span className="text-[10px]">Rs.</span>
                        <span className="font-bold text-espresso-950">{sCharge}</span>
                      </span>
                    </div>
                    <div className="flex justify-between text-espresso-950 font-display text-[1.4rem] font-medium pt-1">
                      <span>Grand Total</span>
                      <span className="flex items-baseline gap-1 font-price">
                        <span className="text-[14px] font-normal text-brown-600">Rs.</span>
                        <span className="font-bold text-brown-800">{grandTotal}</span>
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Slide-to-Confirm Footer */}
            {!whatsappOpened && cart.cart.length > 0 && (
              <div 
                className="p-5 shrink-0"
                style={{ 
                  background: 'var(--glass-bg)',
                  backdropFilter: 'var(--glass-blur)',
                  WebkitBackdropFilter: 'var(--glass-blur)',
                  borderTop: '1px solid var(--glass-border)'
                }}
              >
                {/* Slide to Confirm */}
                <div 
                  ref={slideRef}
                  className="relative h-14 rounded-full overflow-hidden cursor-grab active:cursor-grabbing"
                  style={{ 
                    background: 'linear-gradient(90deg, rgba(28,18,8,0.06) 0%, rgba(28,18,8,0.04) 100%)',
                    border: '1px solid rgba(28,18,8,0.1)'
                  }}
                  onTouchStart={handleSlideStart}
                  onTouchMove={handleSlideMove}
                  onTouchEnd={handleSlideEnd}
                  onMouseDown={handleSlideStart}
                  onMouseMove={handleSlideMove}
                  onMouseUp={handleSlideEnd}
                  onMouseLeave={handleSlideEnd}
                >
                  {/* Background text */}
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <span 
                      className="font-sans text-sm font-semibold tracking-wide"
                      style={{ 
                        color: slideProgress > 0.5 ? 'transparent' : 'rgba(28,18,8,0.5)',
                        transition: 'color 200ms ease'
                      }}
                    >
                      Checkout via WhatsApp — Rs. {grandTotal}
                    </span>
                  </div>
                  
                  {/* Progress fill */}
                  <div 
                    className="absolute inset-0 origin-left pointer-events-none"
                    style={{ 
                      background: 'linear-gradient(90deg, #E8C56A 0%, #C8950F 100%)',
                      transform: `scaleX(${slideProgress})`,
                      transition: isDragging ? 'none' : 'transform 300ms cubic-bezier(0.34, 1.56, 0.64, 1)',
                      opacity: 0.9
                    }}
                  />
                  
                  {/* Slider thumb */}
                  <div 
                    className="absolute top-1 bottom-1 w-12 rounded-full flex items-center justify-center shadow-lg haptic-medium pointer-events-none"
                    style={{ 
                      background: slideProgress > 0.85 ? '#4CAF50' : 'linear-gradient(135deg, #E8C56A 0%, #C8950F 100%)',
                      left: `${slideProgress * 100}%`,
                      transform: `translateX(-${slideProgress * 100}%)`,
                      transition: isDragging ? 'none' : 'left 300ms cubic-bezier(0.34, 1.56, 0.64, 1), background 200ms ease',
                      boxShadow: '0 4px 16px rgba(200,149,15,0.4)'
                    }}
                  >
                    {slideProgress > 0.85 ? (
                      <Icons.Check className="w-5 h-5 text-white" strokeWidth="3" />
                    ) : (
                      <Icons.ChevronRight className="w-5 h-5 text-espresso-950" strokeWidth="2.5" />
                    )}
                  </div>
                </div>
                
                <p className="text-center font-sans text-[11px] text-espresso-400/80 mt-3">
                  You will be redirected to WhatsApp to confirm.
                </p>
              </div>
            )}
          </div>
        </div>
      );
    });

    const CartBar = memo(({ count, total, onOpen }) => {
      const [anim, setAnim] = useState(false);
      const [glow, setGlow] = useState(false);
      
      useEffect(() => { 
        setAnim(true); 
        setGlow(true);
        const t = setTimeout(()=>setAnim(false), 420); 
        const g = setTimeout(()=>setGlow(false), 1200);
        return () => { clearTimeout(t); clearTimeout(g); };
      }, [count]);
      
      if (count === 0) return null;
      
      const grandTotal = total + Math.round(total * SERVICE_CHARGE_RATE);
      
      return (
        <div className="fixed bottom-[72px] w-full max-w-lg mx-auto z-[8000] px-4 pb-2 pointer-events-none left-1/2 -translate-x-1/2">
          <div 
            className={`glass-elevated text-white py-4 px-6 flex justify-between items-center cursor-pointer haptic-medium pointer-events-auto ${anim ? 'animate-pop-elastic' : ''} ${glow ? 'animate-pulse-glow' : ''}`}
            onClick={onOpen} 
            aria-label={`View Order with ${count} items`}
            style={{
              background: 'var(--dark-glass-bg)',
              backdropFilter: 'var(--glass-blur)',
              WebkitBackdropFilter: 'var(--glass-blur)',
              border: '1px solid var(--dark-glass-border)',
              borderRadius: '24px',
              boxShadow: glow 
                ? '0 -8px 32px rgba(160, 120, 90, 0.3), 0 -16px 48px rgba(28, 18, 8, 0.2), 0 8px 32px rgba(0, 0, 0, 0.3)' 
                : '0 -4px 24px rgba(28, 18, 8, 0.12), 0 -12px 40px rgba(28, 18, 8, 0.15), 0 4px 20px rgba(0, 0, 0, 0.25)'
            }}
          >
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="w-10 h-10 rounded-[13px] flex items-center justify-center text-espresso-950" style={{ background: 'linear-gradient(150deg, #D9AE63 0%, #B58A44 100%)', boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.45), 0 3px 10px -3px rgba(0,0,0,0.5)' }}>
                  <Icons.ShoppingCart className="w-5 h-5" strokeWidth="2" />
                </div>
                <div
                  className={`absolute -top-1.5 -right-1.5 text-white w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center border-2 ${anim ? 'animate-pop-elastic' : ''}`}
                  style={{ background: '#1c1208', borderColor: '#D9AE63' }}
                >{count}</div>
              </div>
              <div className="flex flex-col">
                <span className="font-sans text-[14px] font-semibold text-white/90">View Order</span>
                <span className="font-sans text-[10px] font-normal text-brown-400/80">Rs. {total} <span className="opacity-60">(+ Service)</span></span>
              </div>
            </div>
            <div
              className="px-4 py-2.5 flex items-center gap-1.5 haptic-light text-espresso-950 group-active:scale-95 transition-transform"
              style={{
                borderRadius: 'var(--r-btn)',
                fontSize: '11px',
                fontWeight: 700,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                background: 'linear-gradient(135deg, #D9AE63 0%, #B58A44 100%)',
                boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.35), 0 4px 14px -4px rgba(217,174,99,0.6)'
              }}
            >
              Open <Icons.ChevronRight className="w-3 h-3" strokeWidth="2.5" />
            </div>
          </div>
        </div>
      );
    });
    // ─── AI Assistant Screen ───
    const AssistantScreen = memo(({ context, back, setDetailItem, menuData, appConfig }) => {
      const [messages, setMessages] = useState([]);
      const [input, setInput] = useState("");
      const [loading, setLoading] = useState(false);
      const [isTyping, setIsTyping] = useState(false);
      const bottomRef = useRef(null);
      const messagesEndRef = useRef(null);

      // Context-aware greeting based on time and history
      useEffect(() => {
        const hour = new Date().getHours();
        let greeting = "Namaste";
        let suggestion = "";
        
        if (hour >= 5 && hour < 12) {
          greeting = "Good morning";
          suggestion = "How about a fresh cup of coffee to start your day?";
        } else if (hour >= 12 && hour < 16) {
          greeting = "Good afternoon";
          suggestion = "Time for a satisfying lunch? I recommend our momos!";
        } else if (hour >= 16 && hour < 21) {
          greeting = "Good evening";
          suggestion = "Evening cravings? Our snacks are perfect right now.";
        } else {
          greeting = "Hello";
          suggestion = "Late night? We have some light options available.";
        }
        
        const initialMsg = { 
          role: 'assistant', 
          content: `${greeting}! I'm ${appConfig.aiName}, your personal Satkar guide. ${suggestion}`,
          timestamp: Date.now()
        };
        setMessages([initialMsg]);
      }, []);

      useEffect(() => {
        if(bottomRef.current) {
          setTimeout(() => bottomRef.current.scrollIntoView({ behavior: 'smooth' }), 100);
        }
      }, [messages, loading]);

      const getCompactMenuData = () => {
        return menuData.map(m => ({ n: m.name, p: m.price, c: m.subCategory, f: m.flavorProfile.join(','), v: m.foodType === 'veg'?1:0, s: m.isSignatureItem?1:0 }));
      };
      
      // Enhanced context-aware AI
      const localAI = (text) => {
        const q = text.toLowerCase();
        let results = [...menuData].filter(m => m.inStock);
        let reasoning = [];
        
        // Parse dietary
        if (q.includes('veg') && !q.includes('non-veg')) {
          results = results.filter(m => m.foodType === 'veg');
          reasoning.push("vegetarian");
        }
        if (q.includes('non-veg') || q.includes('nonveg')) {
          results = results.filter(m => m.foodType === 'non-veg');
          reasoning.push("non-vegetarian");
        }
        
        // Parse flavor/temp
        if (q.includes('spicy') || q.includes('teekho')) {
          results = results.filter(m => m.flavorProfile.includes('spicy'));
          reasoning.push("spicy");
        }
        if (q.includes('sweet') || q.includes('mitho')) {
          results = results.filter(m => m.flavorProfile.includes('sweet'));
          reasoning.push("sweet");
        }
        if (q.includes('cold') || q.includes('chiso') || q.includes('iced')) {
          results = results.filter(m => m.flavorProfile.includes('cooling'));
          reasoning.push("cold");
        }
        if (q.includes('hot') || q.includes('tato') || q.includes('warm')) {
          results = results.filter(m => m.flavorProfile.includes('thermogenic'));
          reasoning.push("hot");
        }
        
        // Parse category keywords
        const categoryKeywords = {
          'momo': 'momo',
          'coffee': 'coffee',
          'tea': 'tea',
          'pizza': 'pizza',
          'cake': 'bakery_items',
          'dessert': 'dessert',
          'juice': 'juices',
          'shake': 'shakes',
          'burger': 'burger',
          'noodle': 'noodles',
          'chowmein': 'noodles',
          'rice': 'fried_rice'
        };
        
        Object.entries(categoryKeywords).forEach(([keyword, category]) => {
          if (q.includes(keyword)) {
            results = results.filter(m => m.subCategory === category || m.name.toLowerCase().includes(keyword));
          }
        });
        
        // Context-aware: time of day suggestions
        const hour = new Date().getHours();
        if (q.includes('breakfast') || q.includes('morning')) {
          results = results.filter(m => ['coffee', 'tea', 'bakery_items'].includes(m.subCategory));
          reasoning.push("morning favorites");
        }
        if (q.includes('lunch')) {
          results = results.filter(m => ['momo', 'noodles', 'fried_rice', 'burger'].includes(m.subCategory));
          reasoning.push("lunch specials");
        }
        if (q.includes('snack') || q.includes('evening')) {
          results = results.filter(m => ['momo', 'pizza', 'bakery_items', 'fries'].includes(m.subCategory));
          reasoning.push("evening snacks");
        }
        
        // Parse price
        const budgetMatch = q.match(/under\s*(\d+)/) || q.match(/below\s*(\d+)/);
        if (budgetMatch) {
          const budget = parseInt(budgetMatch[1]);
          results = results.filter(m => m.price <= budget);
          reasoning.push(`under Rs. ${budget}`);
        }
        if (q.includes('cheap') || q.includes('budget') || q.includes('sasto')) {
          results = results.filter(m => m.price <= 150);
          reasoning.push("budget-friendly");
        }
        
        // Fallback: if filters eliminated everything, reset to signature items
        if (results.length === 0) {
          results = menuData.filter(m => m.isSignatureItem && m.inStock);
          reasoning.push("our signatures");
        }
        
        const picks = results.sort(() => 0.5 - Math.random()).slice(0, 3);
        const names = picks.map(p => `${p.name} (Rs. ${p.price})`).join(', ');
        
        const intros = [
          "Based on your taste, I recommend:",
          `Here are some ${reasoning.length > 0 ? reasoning.join(', ') : 'great'} options:`,
          "You'll love these:",
          "Perfect picks for you:"
        ];
        const intro = intros[Math.floor(Math.random() * intros.length)];
        
        return { text: `${intro} ${names}. ${picks[0] ? picks[0].description : ''}`, items: picks };
      };

      const handleSend = async (text) => {
        if (!text.trim()) return;
        const userMsg = { role: 'user', content: text, timestamp: Date.now() };
        const newMsgs = [...messages, userMsg];
        setMessages(newMsgs);
        setInput("");
        setLoading(true);
        setIsTyping(true);

        try {
          const compactMenu = menuData.map(m => `${m.name} (Rs.${m.price})`).join(', ');
          const hour = new Date().getHours();
          const timeContext = hour >= 5 && hour < 12 ? "morning" : hour >= 12 && hour < 16 ? "afternoon" : "evening";
          
          const systemMsg = { 
            role: 'system', 
            content: `You are ${appConfig.aiName}, a warm, playful AI for Satkar Bakery & Cafe in Dipayal, Doti. It's currently ${timeContext}. Keep answers under 2 sentences. Our menu: ${compactMenu}. Only recommend these items. Use emojis occasionally.`
          };
          
          const res = await fetch('https://text.pollinations.ai/openai', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: 'openai',
              messages: [systemMsg, ...newMsgs.map(m => ({ role: m.role, content: m.content }))]
            })
          });
          
          if (!res.ok) throw new Error('API Error');
          const data = await res.json();
          const aiText = data.choices[0].message.content;
          setTimeout(() => {
            setMessages([...newMsgs, { role: 'assistant', content: aiText, timestamp: Date.now() }]);
            haptic('light');
            setIsTyping(false);
          }, 600);
        } catch (e) {
          const result = localAI(text);
          setTimeout(() => {
            setMessages([...newMsgs, { role: 'assistant', content: result.text, timestamp: Date.now() }]);
            haptic('light');
            setIsTyping(false);
          }, 400);
        } finally {
          setLoading(false);
        }
      };

      const parseMsgWithItems = (text) => {
        let parsed = text;
        const matchedItems = [];
        menuData.forEach(item => {
          if (text.toLowerCase().includes(item.name.toLowerCase())) {
            matchedItems.push(item);
          }
        });
        return { text: parsed, items: matchedItems.slice(0, 2) };
      };

      const quickReplies = ["What's popular?", "Vegetarian options", "Under Rs. 200", "Something sweet", "Quick bites"];
      
      // Dynamic suggestions based on conversation context
      const getDynamicSuggestions = () => {
        const lastMsg = messages[messages.length - 1];
        if (!lastMsg || lastMsg.role !== 'assistant') return quickReplies;
        
        const content = lastMsg.content.toLowerCase();
        if (content.includes('momo')) return ["Chicken momo", "Veg momo", "Fried momo", "Jhol momo"];
        if (content.includes('coffee')) return ["Espresso", "Cappuccino", "Iced Americano", "Latte"];
        if (content.includes('sweet') || content.includes('dessert')) return ["Cakes", "Pastries", "Chocolava Cake", "Brownies"];
        if (content.includes('drink') || content.includes('beverage')) return ["Fresh juice", "Milkshake", "Mojito", "Soft Drinks"];
        return quickReplies;
      };

      return (
        <div 
          className="fixed inset-0 z-[10000] flex flex-col textured-ground"
          style={{ 
            background: 'var(--s-ground)'
          }}
        >
          {/* Header */}
          <div 
            className="text-espresso-950 p-4 pt-safe flex items-center shrink-0"
            style={{ 
              background: 'var(--s-ground)',
              borderBottom: '1px solid var(--glass-border)',
              boxShadow: '0 4px 24px rgba(28, 18, 8, 0.06)'
            }}
          >
            <button 
              className="w-11 h-11 flex items-center justify-center shrink-0 haptic-light"
              style={{ borderRadius: '50%', background: 'rgba(160, 120, 90, 0.1)', border: '1px solid rgba(160, 120, 90, 0.15)' }}
              onClick={back}
              aria-label="Back"
            >
              <Icons.ArrowLeft className="w-5 h-5 text-espresso-700" strokeWidth="2" />
            </button>
            <div className="flex-1 ml-3">
              <div 
                className="font-display text-[17px] font-normal text-espresso-950"
                style={{ fontVariationSettings: "'wght' 400, 'opsz' 144" }}
              >{appConfig.aiName}</div>
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)] animate-pulse"></span>
                <span className="font-sans text-[10px] font-medium uppercase tracking-[0.15em] text-espresso-400">AI Concierge • Online</span>
              </div>
            </div>
            <div
              className="w-10 h-10 flex items-center justify-center text-espresso-950"
              style={{ borderRadius: '50%', background: 'linear-gradient(150deg, #D9AE63 0%, #B58A44 100%)', boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.4), 0 3px 10px -3px rgba(140,101,45,0.5)' }}
            >
              <Icons.Sparkles className="w-5 h-5" strokeWidth="1.75" />
            </div>
          </div>

          {/* Chat Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-5 flex flex-col">
            {messages.map((m, i) => {
              const parse = m.role === 'assistant' ? parseMsgWithItems(m.content) : { text: m.content, items: [] };
              const isFirst = i === 0;
              return (
                <div 
                  key={i} 
                  className={`flex flex-col max-w-[88%] ${m.role === 'user' ? 'self-end items-end' : 'self-start items-start'}`}
                  style={{ 
                    animation: `springIn 400ms cubic-bezier(0.34, 1.56, 0.64, 1) ${isFirst ? 0 : i * 80}ms forwards`,
                    opacity: 0,
                    transform: 'translateY(20px)'
                  }}
                >
                  {/* Message Bubble */}
                  <div 
                    className="relative"
                    style={m.role === 'user' ? {
                      background: 'linear-gradient(135deg, #B58A44 0%, #8C652D 100%)',
                      color: '#FFF8EE',
                      borderRadius: '20px 20px 4px 20px',
                      boxShadow: '0 4px 16px rgba(140, 101, 45, 0.25)',
                      padding: '14px 18px',
                      fontWeight: 500
                    } : {
                      background: 'linear-gradient(160deg, #FFFFFF 0%, var(--s-card) 100%)',
                      border: '1px solid rgba(160, 120, 90, 0.14)',
                      borderRadius: '4px 20px 20px 20px',
                      boxShadow: '0 1px 2px rgba(28,18,8,0.04), 0 10px 24px -14px rgba(28,18,8,0.18)',
                      color: 'var(--espresso-900)',
                      padding: '14px 18px',
                      fontWeight: 400,
                      lineHeight: '1.6'
                    }}
                  >
                    <span className="text-[15px] leading-relaxed text-espresso-800">{parse.text}</span>
                  </div>
                  
                  {/* Timestamp */}
                  <span className="text-[9px] text-espresso-400/50 mt-1.5 px-1 uppercase tracking-wider">
                    {new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  
                  {/* Item Cards */}
                  {parse.items.length > 0 && (
                    <div className="mt-3 space-y-2.5 w-full max-w-[300px]">
                      {parse.items.map((item, idx) => (
                        <div 
                          key={item.id} 
                          className="flex items-center gap-3 cursor-pointer haptic-light p-2.5 transition-all active:scale-[0.98]"
                          style={{
                            borderRadius: '18px',
                            background: 'linear-gradient(160deg, #FFFFFF 0%, var(--s-card) 100%)',
                            border: '1px solid rgba(160, 120, 90, 0.14)',
                            boxShadow: '0 1px 2px rgba(28,18,8,0.04), 0 10px 24px -14px rgba(28,18,8,0.18)',
                            animation: `springIn 400ms ease-out ${idx * 100}ms both`
                          }}
                          onClick={() => setDetailItem(item)}
                        >
                          <img
                            src={item.imageUrl}
                            className="w-14 h-14 object-cover shrink-0"
                            style={{ borderRadius: '12px', aspectRatio: '1/1', boxShadow: '0 3px 10px -3px rgba(28,18,8,0.3)', border: '1px solid rgba(160,120,90,0.15)' }}
                            alt=""
                          />
                          <div className="flex-1 min-w-0 pr-1">
                            <div className="font-display text-[14px] font-normal text-espresso-950 line-clamp-1 leading-tight">{item.name}</div>
                            <div className="flex items-baseline gap-0.5 mt-1">
                              <span className="font-price text-[10px] text-espresso-500">Rs.</span>
                              <span className="font-price text-[15px] font-bold text-espresso-900">{item.price}</span>
                            </div>
                          </div>
                          <div
                            className="w-8 h-8 flex items-center justify-center shrink-0 text-espresso-950"
                            style={{ borderRadius: '50%', background: 'linear-gradient(150deg, #D9AE63 0%, #B58A44 100%)', boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.4), 0 2px 8px -2px rgba(140,101,45,0.5)' }}
                          >
                            <Icons.ChevronRight className="w-3.5 h-3.5" strokeWidth="3"/>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
            
            {/* Typing Indicator */}
            {(loading || isTyping) && (
              <div 
                className="self-start p-3.5 flex gap-1.5 items-center"
                style={{ 
                  borderRadius: '4px 20px 20px 20px',
                  background: 'var(--s-card)',
                  border: '1px solid rgba(160, 120, 90, 0.1)'
                }}
              >
                <div 
                  className="w-1.5 h-1.5 rounded-full bg-espresso-400/60"
                  style={{ animation: 'typingBounce 1.4s ease-in-out infinite' }}
                />
                <div 
                  className="w-1.5 h-1.5 rounded-full bg-espresso-400/60"
                  style={{ animation: 'typingBounce 1.4s ease-in-out infinite 0.2s' }}
                />
                <div 
                  className="w-1.5 h-1.5 rounded-full bg-espresso-400/60"
                  style={{ animation: 'typingBounce 1.4s ease-in-out infinite 0.4s' }}
                />
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input Area */}
          <div 
            className="px-4 py-3 pb-safe z-10"
            style={{ 
              background: 'var(--s-ground)',
              borderTop: '1px solid var(--glass-border)',
              boxShadow: '0 -4px 24px rgba(28, 18, 8, 0.06)'
            }}
          >
            {/* Quick Replies */}
            {!loading && messages.length > 0 && (
              <div className="flex overflow-x-auto gap-2 hide-scrollbar mb-4 -mx-4 px-4 pb-1">
                {getDynamicSuggestions().map((r, i) => (
                  <button
                    key={r}
                    onClick={()=>handleSend(r)}
                    className="shrink-0 text-[11px] font-semibold py-2 px-4 whitespace-nowrap haptic-light active:scale-95 transition-all select-none"
                    style={{
                      borderRadius: 'var(--r-btn)',
                      background: 'var(--glass-bg)',
                      border: '1px solid rgba(160,120,90,0.14)',
                      color: '#7a5c3a',
                      boxShadow: 'var(--glass-shadow)',
                      animationDelay: `${i * 40}ms`
                    }}
                  >{r}</button>
                ))}
              </div>
            )}
            
            {/* Input Field */}
            <div className="flex gap-2.5 items-center mb-1">
              <div className="flex-1 relative">
                <input 
                  type="text"
                  value={input} 
                  onChange={e=>setInput(e.target.value)} 
                  placeholder={`Ask ${appConfig.aiName}...`} 
                  className="w-full pl-5 pr-4 py-3 text-[15px] text-espresso-950 focus:outline-none placeholder:text-espresso-400"
                  style={{ 
                    background: 'var(--s-input)', 
                    border: '1px solid rgba(28, 18, 8, 0.08)', 
                    borderRadius: '24px'
                  }}
                  onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();handleSend(input);}}}
                />
              </div>
              <button 
                className={`w-[48px] h-[48px] rounded-full flex items-center justify-center shrink-0 transition-all haptic-medium ${input.trim() ? '' : 'opacity-40'}`}
                style={input.trim() ? {
                  background: 'linear-gradient(135deg, #D9AE63 0%, #B58A44 100%)',
                  boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.35), 0 4px 16px rgba(140, 101, 45, 0.35)'
                } : {
                  background: 'rgba(160, 120, 90, 0.1)'
                }}
                onClick={()=>handleSend(input)}
                disabled={!input.trim()}
              >
                <Icons.Send className={`w-5 h-5 ${input.trim() ? 'text-espresso-950' : 'text-espresso-400'}`} strokeWidth="2.5" />
              </button>
            </div>
          </div>
        </div>
      );
    });

    
    const GeometryGuide = ({ aspect = "1/1", label = "Crop Zone" }) => (
      <div className="absolute inset-0 pointer-events-none flex items-center justify-center overflow-hidden">
        <div style={{ aspectRatio: aspect }} className="w-full relative">
           <div className="absolute inset-0 border-2 border-dashed border-white/60 shadow-[0_0_0_100vmax_rgba(0,0,0,0.5)] z-10 flex items-center justify-center">
              <div className="px-2 py-1 bg-black/40 backdrop-blur rounded text-[8px] text-white/80 uppercase font-bold tracking-widest">{label}</div>
           </div>
        </div>
      </div>
    );

    const AdminCategories = ({ categories, syncCategories, menuData, syncMenuToCloud }) => {
      const [editCat, setEditCat] = useState(null);
      const [assignedItems, setAssignedItems] = useState(new Set());
      const iconList = ['droplets', 'glass', 'wind', 'soup', 'box', 'leaf', 'Coffee', 'Pizza', 'Utensils', 'Flame'];

      useEffect(() => {
        if (editCat) {
          if (editCat.id.startsWith('new_')) {
            setAssignedItems(new Set());
          } else {
            const itemIds = menuData.filter(m => m.category === editCat.label).map(m => m.id);
            setAssignedItems(new Set(itemIds));
          }
        }
      }, [editCat?.id]);

      const handleSave = async (updated) => {
        const final = categories.map(c => c.id === updated.id ? updated : c);
        if (!categories.find(c => c.id === updated.id)) final.push(updated);
        
        const newMenuData = menuData.map(m => {
           const isAssigned = assignedItems.has(m.id);
           if (isAssigned) return { ...m, category: updated.label };
           if (!isAssigned && m.category === editCat.label) return { ...m, category: 'Other' };
           return m;
        });

        await Promise.all([
           syncCategories(final),
           __db.collection('config').doc('menu').set({ items: newMenuData }, { merge: true })
        ]);

        setEditCat(null);
      };

      const handleDelete = async (id) => {
        if (!confirm("Are you sure? Items in this category will lose their group!")) return;
        const final = categories.filter(c => c.id !== id);
        await syncCategories(final);
      };

      if (editCat) {
        return (
          <div className="animate-fade-in space-y-6">
             <div className="flex justify-between items-center">
               <button className="text-sm text-espresso-600 bg-sand-200 border border-sand-300 px-3 py-1.5 rounded-full" onClick={()=>setEditCat(null)}>Back</button>
               <h3 className="text-espresso-950 font-display text-lg">{editCat.id.startsWith('new_') ? 'Add Category' : 'Edit Category'}</h3>
             </div>
             <div className="space-y-4">
                <div>
                   <label className="text-[10px] text-espresso-400 uppercase font-bold block mb-1">Label Name</label>
                   <input type="text" value={editCat.label} onChange={e=>setEditCat({...editCat, label: e.target.value, id: editCat.id.startsWith('new_') ? e.target.value : editCat.id})} className="w-full bg-sand-50 border border-espresso-200 rounded-lg px-4 py-2 text-espresso-950 shadow-sm" />
                </div>
                <div>
                   <label className="text-[10px] text-espresso-400 uppercase font-bold block mb-1">Description</label>
                   <input type="text" value={editCat.desc} onChange={e=>setEditCat({...editCat, desc: e.target.value})} className="w-full bg-sand-50 border border-espresso-200 rounded-lg px-4 py-2 text-espresso-950 shadow-sm" />
                </div>
                <div>
                   <label className="text-[10px] text-espresso-400 uppercase font-bold block mb-1">Category Image (Optional)</label>
                   <p className="text-[9px] text-espresso-500 mb-2">Upload a small image to replace the default icon</p>
                   <ImageUploadZone 
                     value={editCat.imageUrl || ''} 
                     onChange={(url) => setEditCat({...editCat, imageUrl: url})}
                     storagePath={`categories/${editCat.id || Date.now()}.jpg`}
                     compact={true}
                     label="Category"
                   />
                </div>
                <div>
                   <label className="text-[10px] text-espresso-400 uppercase font-bold block mb-1">Icon Selection</label>
                   <p className="text-[9px] text-espresso-500 mb-1">Used when no image is uploaded</p>
                   <div className="grid grid-cols-5 gap-2 mt-2">
                      {iconList.map(icon => (
                        <button key={icon} onClick={()=>setEditCat({...editCat, icon})} className={`w-12 h-12 rounded-lg flex items-center justify-center transition-colors shadow-sm ${editCat.icon === icon ? 'bg-espresso-900 text-sand-50' : 'bg-white text-espresso-500 border border-espresso-200'}`}>
                          <CategoryIcon icon={icon} className="w-5 h-5" strokeWidth="2" />
                        </button>
                      ))}
                   </div>
                </div>
                {/* Item Assignment UI */}
                <div>
                   <label className="text-[10px] text-espresso-400 uppercase font-bold block mb-1">Assigned Items</label>
                   <p className="text-[9px] text-espresso-500 mb-2">Tap to add items to this category</p>
                   <div className="space-y-2 max-h-60 overflow-y-auto hide-scrollbar" style={{ padding: '2px' }}>
                     {[...menuData].sort((a, b) => {
                         const aAssigned = assignedItems.has(a.id);
                         const bAssigned = assignedItems.has(b.id);
                         if (aAssigned && !bAssigned) return -1;
                         if (!aAssigned && bAssigned) return 1;
                         return 0;
                     }).map(m => {
                        const isAssigned = assignedItems.has(m.id);
                        return (
                          <div 
                            key={m.id} 
                            onClick={() => {
                               const next = new Set(assignedItems);
                               if(isAssigned) next.delete(m.id); else next.add(m.id);
                               setAssignedItems(next);
                            }}
                            className={`flex items-center justify-between p-3 rounded-xl border text-xs transition-colors cursor-pointer shadow-sm ${isAssigned ? 'bg-sand-200/50 border-brown-500 font-bold text-espresso-950' : 'bg-white border-espresso-100 text-espresso-600 hover:bg-sand-100'}`}
                          >
                             <div className="flex flex-col">
                               <span>{m.name}</span>
                               {!isAssigned && m.category && m.category !== 'Other' && <span className="text-[9px] text-espresso-400 font-medium">Currently in: {m.category}</span>}
                             </div>
                             {isAssigned && <Icons.Check className="w-4 h-4 text-brown-600 shrink-0" />}
                          </div>
                        )
                     })}
                   </div>
                </div>
                <button onClick={()=>handleSave(editCat)} className="w-full py-4 bg-espresso-900 text-sand-50 rounded-xl font-bold mt-4 shadow-lg active:scale-95 transition-transform">Save Category</button>
             </div>
          </div>
        );
      }

      return (
        <div className="animate-fade-in space-y-4">
           <button onClick={()=>{ haptic('medium'); setEditCat({ id: 'new_'+Date.now(), label: '', icon: 'leaf', desc: '', imageUrl: '' }); }} className="w-full py-4 border-2 border-dashed border-espresso-200 bg-white shadow-sm rounded-2xl flex items-center justify-center gap-2 text-espresso-600 hover:bg-sand-100 hover:text-espresso-950 transition-colors font-bold mb-6 mt-2">
             <Icons.Plus className="w-5 h-5" /> Add New Category
           </button>
           {(categories || []).filter(c => c.id !== 'All').map(c => (
              <div key={c.id} className="bg-white border border-espresso-100 shadow-sm p-4 rounded-2xl flex items-center justify-between">
                 <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-sand-100 rounded-full flex items-center justify-center text-brown-500 border border-sand-200 relative overflow-hidden">
                       <CategoryIcon icon={c.icon} className="w-5 h-5" strokeWidth="2" />
                    </div>
                    <div>
                       <div className="font-bold text-espresso-950 text-sm">{c.label}</div>
                       <div className="text-[10px] text-espresso-400">{c.desc}</div>
                    </div>
                 </div>
                 <div className="flex gap-2">
                    <button onClick={()=>setEditCat(c)} className="px-3 py-1.5 bg-sand-100 border border-sand-200 rounded-full text-xs font-bold text-espresso-600 hover:bg-sand-200 hover:text-espresso-950 transition-colors uppercase tracking-widest">Edit</button>
                    <button onClick={()=>handleDelete(c.id)} className="p-2 text-red-950 hover:text-red-500 transition-colors"><Icons.X className="w-4 h-4" /></button>
                 </div>
              </div>
           ))}
        </div>
      );
    };
// ─── Admin Screen & CRUD ───
    // Compress images client-side: max 800px wide, quality 0.85, returns blob for proper Storage upload
    const compressImage = (file, targetWidth = 800, quality = 0.85) => {
      return new Promise((resolve, reject) => {
        if (file.size > 10 * 1024 * 1024) {
          reject(new Error('File too large (max 10MB)'));
          return;
        }
        const reader = new FileReader();
        reader.onload = e => {
          const img = new Image();
          img.onload = () => {
            const canvas = document.createElement('canvas');
            const w = Math.min(targetWidth, img.width);
            const scale = w / img.width;
            canvas.width = w;
            canvas.height = img.height * scale;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            canvas.toBlob(blob => {
              if (blob) resolve(blob);
              else reject(new Error('Compression failed'));
            }, 'image/jpeg', quality);
          };
          img.onerror = () => reject(new Error('Invalid image file'));
          img.src = e.target.result;
        };
        reader.onerror = () => reject(new Error('Could not read file'));
        reader.readAsDataURL(file);
      });
    };

    // Upload blob to Firebase Storage, returns download URL. onProgress(0..100)
    const uploadToStorage = (blob, path, onProgress) => {
      return new Promise((resolve, reject) => {
        const ref = __storage.ref().child(path);
        const task = ref.put(blob, { contentType: 'image/jpeg' });
        task.on('state_changed',
          snap => {
            const pct = Math.round((snap.bytesTransferred / snap.totalBytes) * 100);
            if (onProgress) onProgress(pct);
          },
          err => reject(err),
          async () => {
            try {
              const url = await task.snapshot.ref.getDownloadURL();
              resolve(url);
            } catch (e) { reject(e); }
          }
        );
      });
    };

    // SafeImage: Wraps <img> — shows a neutral placeholder on broken src
    const SafeImage = ({ src, alt, className, style, ...rest }) => {
      const [broken, setBroken] = useState(false);
      const [loaded, setLoaded] = useState(false);
      
      useEffect(() => { setBroken(false); setLoaded(false); }, [src]);
      
      if (broken || !src) {
        return (
          <div 
            className={className} 
            style={{ ...style, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#E8E2D6', color: '#A09484' }}
            {...rest}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ width: '28%', height: '28%', maxWidth: '40px', opacity: 0.5 }}>
              <path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/>
              <line x1="7" y1="2" x2="7" y2="15"/>
              <path d="M18 15V2a1 1 0 0 0-1-1h-1a1 1 0 0 0-1 1v13a4 4 0 0 0 8 0v-2"/>
              <line x1="21" y1="2" x2="21" y2="15"/>
            </svg>
          </div>
        );
      }
      
      return (
        <img 
          src={src} 
          alt={alt || ''} 
          className={className} 
          style={style}
          onError={() => setBroken(true)}
          onLoad={() => setLoaded(true)}
          {...rest}
        />
      );
    };

    // ImageUploadZone: Hybrid upload (Firebase Storage) + URL paste with preview & progress
    const ImageUploadZone = ({ value, onChange, storagePath, aspect = '1/1', label = 'Upload Image', compact = false }) => {
      const [preview, setPreview] = useState(value || '');
      const [uploading, setUploading] = useState(false);
      const [progress, setProgress] = useState(0);
      const [error, setError] = useState('');
      const [showUrlInput, setShowUrlInput] = useState(false);
      const [urlInput, setUrlInput] = useState('');
      const [urlValid, setUrlValid] = useState(null);
      const [isPendingUrl, setIsPendingUrl] = useState(false);
      const fileRef = useRef(null);
      const retryFileRef = useRef(null);

      // Sync preview with incoming value, but only if we're not in the middle of an operation
      useEffect(() => { 
        if (!uploading && !isPendingUrl) {
          setPreview(value || ''); 
        }
      }, [value, uploading, isPendingUrl]);

      const handleFile = async (file) => {
        if (!file) return;
        setError('');
        // Instant local preview
        const localUrl = URL.createObjectURL(file);
        setPreview(localUrl);
        setUploading(true);
        setProgress(0);
        retryFileRef.current = file;
        try {
          const blob = await compressImage(file, 800, 0.85);
          const path = storagePath || `uploads/${Date.now()}.jpg`;
          const downloadUrl = await uploadToStorage(blob, path, pct => setProgress(pct));
          URL.revokeObjectURL(localUrl);
          setPreview(downloadUrl);
          onChange(downloadUrl);
          setUploading(false);
          setProgress(100);
          haptic('success');
          showToast('Image uploaded successfully!');
        } catch (err) {
          setUploading(false);
          setError(err.message || 'Upload failed. Tap to retry.');
          haptic('error');
        }
      };

      const handleRetry = () => {
        if (retryFileRef.current) handleFile(retryFileRef.current);
      };

      const handleUrlApply = () => {
        const url = urlInput.trim();
        if (!url) return;
        
        setError('');
        setIsPendingUrl(true);
        setUrlValid('checking');
        
        const img = new Image();
        img.onload = () => { 
          setUrlValid(true); 
          setPreview(url); 
          onChange(url); 
          haptic('success'); 
          setIsPendingUrl(false);
          showToast('URL checked and applied');
        };
        img.onerror = () => { 
          setUrlValid(false); 
          setIsPendingUrl(false);
          haptic('error');
          showToast('Invalid image URL', 'error');
        };
        img.src = url;
      };

      const size = compact ? 'w-16 h-16' : 'w-full';

      return (
        <div className="space-y-2">
          {/* Upload Zone */}
          <div 
            className={`${size} relative rounded-2xl overflow-hidden cursor-pointer group transition-all border-2 border-dashed`}
            style={{ 
              aspectRatio: compact ? '1/1' : aspect, 
              background: preview ? 'transparent' : 'rgba(28,18,8,0.04)',
              borderColor: error ? 'rgba(168,66,50,0.5)' : (uploading || isPendingUrl) ? 'rgba(160,120,90,0.4)' : 'rgba(28,18,8,0.15)'
            }}
            onClick={() => !uploading && !isPendingUrl && fileRef.current?.click()}
          >
            <input 
              ref={fileRef} 
              type="file" 
              accept="image/*" 
              className="hidden" 
              onChange={e => handleFile(e.target.files[0])} 
            />
            
            {(preview || value) && !error && (
              <img src={preview || value} className="absolute inset-0 w-full h-full object-cover" alt="Preview" />
            )}
            
            {/* Overlay */}
            <div className={`absolute inset-0 flex flex-col items-center justify-center transition-opacity ${(preview || value) && !error ? 'bg-black/40 opacity-0 group-hover:opacity-100' : 'opacity-100'}`}>
              {uploading ? (
                <div className="flex flex-col items-center gap-2 px-4 w-full">
                  <div className="w-full max-w-[200px] h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.2)' }}>
                    <div 
                      className="h-full rounded-full transition-all duration-300" 
                      style={{ width: `${progress}%`, background: 'linear-gradient(90deg, #E8C56A, #C8950F)' }}
                    />
                  </div>
                  <span className="text-white text-[11px] font-bold">{progress}%</span>
                </div>
              ) : isPendingUrl ? (
                <div className="flex flex-col items-center gap-2 text-white">
                   <Icons.Sparkles className="w-6 h-6 animate-pulse text-brown-400" />
                   <span className="text-[10px] font-bold uppercase tracking-widest">Checking...</span>
                </div>
              ) : error ? (
                <div className="flex flex-col items-center gap-2 text-center px-3" onClick={(e) => { e.stopPropagation(); handleRetry(); }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="#E57373" strokeWidth="2" className="w-6 h-6">
                    <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
                  </svg>
                  <span className="text-[11px] text-red-300 font-medium">{error}</span>
                  <button className="text-[10px] bg-white/20 backdrop-blur px-3 py-1 rounded-full text-white font-bold">Retry</button>
                </div>
              ) : (
                <>
                  <Icons.Camera className={`${compact ? 'w-4 h-4' : 'w-6 h-6'} ${(preview || value) ? 'text-white' : 'text-espresso-400'}`} />
                  {!compact && <span className={`text-[11px] font-bold mt-1 ${(preview || value) ? 'text-white' : 'text-espresso-400'}`}>{label}</span>}
                </>
              )}
            </div>
          </div>

          {/* URL Fallback */}
          {!compact && (
            <div>
              <button 
                className="text-[10px] text-espresso-400 font-medium flex items-center gap-1 hover:text-espresso-600 transition-colors"
                onClick={() => setShowUrlInput(!showUrlInput)}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3 h-3">
                  <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
                  <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
                </svg>
                {showUrlInput ? 'Hide URL input' : 'Or paste an image URL'}
              </button>
              {showUrlInput && (
                <div className="mt-2 flex gap-2">
                  <input 
                    type="text" 
                    value={urlInput} 
                    onChange={e => { setUrlInput(e.target.value); setUrlValid(null); }}
                    placeholder="https://example.com/image.jpg"
                    className="flex-1 bg-espresso-950 border rounded-lg px-3 py-2 text-sm text-white focus:outline-none"
                    style={{ borderColor: urlValid === false ? '#E57373' : urlValid === true ? '#81C784' : 'rgba(82,61,50,0.4)' }}
                  />
                  <button 
                    onClick={handleUrlApply}
                    disabled={isPendingUrl || !urlInput.trim()}
                    className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${urlInput.trim() ? 'bg-brown-500 text-espresso-950 shadow-md active:scale-95' : 'bg-espresso-900 text-espresso-600 border border-espresso-800'}`}
                  >
                    Apply
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      );
    };

    const AdminSettings = ({ appConfig, saveGlobals }) => {
      const [localConfig, setLocalConfig] = useState(appConfig || {});
      const [saving, setSaving] = useState(false);
      const isDirty = useRef(false);

      useEffect(() => {
        if (!isDirty.current && appConfig) {
          setLocalConfig(appConfig);
        }
      }, [appConfig]);

      const handleSave = async () => {
        setSaving(true);
        const configToSave = { ...localConfig };
        await saveGlobals(configToSave);
        haptic('success');
        setSaving(false);
        showToast("Settings updated successfully!");
        setLocalConfig(configToSave);
        isDirty.current = false;
      };

      return (
        <div className="space-y-8 animate-fade-in pb-20">
           <div>
              <h3 className="text-brown-500 font-bold tracking-widest text-xs uppercase mb-4">AI Identity</h3>
              <div className="bg-white p-5 rounded-2xl border border-espresso-100 shadow-sm">
                 <label className="text-xs text-espresso-400 mb-2 block">Assistant Name (Updates AI Context)</label>
                 <div className="flex gap-2">
                   <input 
                     type="text" 
                     value={localConfig.aiName || ''} 
                     onChange={e=>{setLocalConfig({...localConfig, aiName: e.target.value}); isDirty.current=true;}} 
                     className="flex-1 bg-sand-50 border border-espresso-200 rounded-lg px-3 py-2 text-espresso-950 focus:border-brown-500 max-w-[200px] outline-none font-sans" 
                   />
                 </div>
               </div>
            </div>

           <div>
              <h3 className="text-brown-500 font-bold tracking-widest text-xs uppercase mb-4">Customer Communication</h3>
              <div className="bg-white p-5 rounded-2xl border border-espresso-100 shadow-sm space-y-5">
                 <div>
                   <div className="flex justify-between items-center mb-3">
                     <label className="text-[10px] text-espresso-400 font-bold uppercase tracking-widest block">Announcement Banner</label>
                     <button className={`w-10 h-5 rounded-full relative transition-colors ${localConfig.announcementActive ? 'bg-espresso-900' : 'bg-espresso-200'}`} onClick={()=>{setLocalConfig({...localConfig, announcementActive: !localConfig.announcementActive}); isDirty.current=true;}}>
                       <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all shadow-sm ${localConfig.announcementActive ? 'left-5' : 'left-0.5'}`}></div>
                     </button>
                   </div>
                   <input 
                     type="text" 
                     placeholder="e.g. Happy Hour 4-6 PM — 20% off mocktails!"
                     value={localConfig.announcementText || ''} 
                     onChange={e=>{setLocalConfig({...localConfig, announcementText: e.target.value}); isDirty.current=true;}} 
                     className="w-full bg-sand-50 border border-espresso-200 rounded-lg px-3 py-2 text-espresso-950 focus:border-brown-500 outline-none font-sans text-sm" 
                   />
                 </div>
              </div>
           </div>

           <div>
              <h3 className="text-brown-500 font-bold tracking-widest text-xs uppercase mb-4">Branding</h3>
              <div className="bg-white p-5 rounded-2xl border border-espresso-100 shadow-sm space-y-4">
                 <div>
                   <label className="text-xs text-espresso-400 mb-2 block">Primary Color</label>
                   <input 
                     type="color" 
                     value={localConfig.primaryColor || '#D9ae63'} 
                     onChange={e=>{setLocalConfig({...localConfig, primaryColor: e.target.value}); isDirty.current=true;}} 
                     className="w-full h-10 border-0 rounded-lg cursor-pointer bg-transparent" 
                   />
                 </div>
                 <div>
                   <label className="text-xs text-espresso-400 mb-2 block">Background Color</label>
                   <input 
                     type="color" 
                     value={localConfig.backgroundColor || '#EBE2D4'} 
                     onChange={e=>{setLocalConfig({...localConfig, backgroundColor: e.target.value}); isDirty.current=true;}} 
                     className="w-full h-10 border-0 rounded-lg cursor-pointer bg-transparent" 
                   />
                 </div>
              </div>
           </div>

           <button 
             onClick={handleSave} 
             disabled={saving} 
             className="w-full py-4 bg-espresso-900 text-sand-50 rounded-xl font-bold shadow-lg active:scale-95 transition-transform disabled:opacity-50 flex items-center justify-center gap-2"
           >
             {saving && <Icons.Sparkles className="w-4 h-4 animate-spin" />}
             {saving ? 'Saving System Changes...' : 'Save Settings'}
           </button>
           {isDirty.current && <p className="text-[10px] text-brown-400 text-center animate-pulse">You have unsaved changes</p>}
        </div>
      );
    };

    const AdminSpecials = ({ menuData }) => {
      const [search, setSearch] = useState("");
      
      const toggleSpecial = async (item) => {
        haptic('light');
        const updatedItem = { ...item, isSignatureItem: !item.isSignatureItem };
        const finalMenu = menuData.map(m => m.id === item.id ? updatedItem : m);
        
        try {
          await __db.collection('config').doc('menu').set({ items: finalMenu }, { merge: true });
          showToast(`${item.name} ${updatedItem.isSignatureItem ? 'added to' : 'removed from'} specials`);
        } catch (e) {
          showToast("Failed to update special.", "error");
        }
      };

      const specials = menuData.filter(m => m.isSignatureItem);
      const nonSpecials = menuData.filter(m => !m.isSignatureItem);

      return (
        <div className="space-y-6 pb-20 animate-fade-in">
          <div className="relative">
            <Icons.Search className="absolute left-4 top-1/2 -translate-y-1/2 text-espresso-500 w-5 h-5 pointer-events-none" />
            <input 
              type="text" 
              value={search} 
              onChange={e=>setSearch(e.target.value)} 
              placeholder="Search dishes to make special..." 
              className="w-full bg-white border border-espresso-200 rounded-2xl py-3 pl-12 pr-4 text-sm focus:outline-none focus:border-brown-500 transition-colors text-espresso-950 shadow-sm" 
            />
          </div>

          {specials.length > 0 && (
            <div>
              <h3 className="text-[10px] text-brown-500 font-bold uppercase tracking-widest mb-3 px-1">Active Specials</h3>
              <div className="space-y-2">
                {specials.map(m => (
                  <div key={m.id} className="flex items-center justify-between p-3 bg-white border border-brown-200 shadow-sm rounded-2xl">
                    <div className="flex items-center gap-3">
                      <img src={m.imageUrl} alt="" className="w-10 h-10 rounded-xl object-cover" />
                      <div>
                        <div className="text-sm font-bold text-espresso-950">{m.name}</div>
                        <div className="text-[10px] text-brown-500 font-bold">Featured Signature</div>
                      </div>
                    </div>
                    <button 
                      onClick={() => toggleSpecial(m)}
                      className="w-8 h-8 rounded-full bg-brown-100 text-brown-600 flex items-center justify-center active:scale-90 transition-transform"
                    >
                      <Icons.X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <h3 className="text-[10px] text-espresso-400 font-bold uppercase tracking-widest mb-3 px-1">{search ? 'Search Results' : 'All Dishes'}</h3>
            <div className="space-y-2">
              {(search ? nonSpecials.filter(m => fuzzyMatch(search, m.name) > 0) : nonSpecials).slice(0, 15).map(m => (
                <div key={m.id} className="flex items-center justify-between p-3 bg-white border border-espresso-100 shadow-sm rounded-2xl opacity-80 hover:opacity-100 transition-opacity">
                  <div className="flex items-center gap-3">
                    <img src={m.imageUrl} alt="" className="w-10 h-10 rounded-xl object-cover grayscale" />
                    <div className="text-sm font-medium text-espresso-800">{m.name}</div>
                  </div>
                  <button 
                    onClick={() => toggleSpecial(m)}
                    className="px-3 py-1.5 rounded-full border border-espresso-200 text-[10px] font-bold uppercase tracking-wider text-espresso-400 hover:border-brown-400 hover:text-brown-600 transition-colors"
                  >
                    Feature
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      );
    };

    const InsightsGraph = ({ data }) => {
      const [metric, setMetric] = useState('revenue');
      const [hoverIdx, setHoverIdx] = useState(null);
      const graphRef = useRef(null);
      
      if (!data || data.length === 0) return (
        <div className="bg-white/80 backdrop-blur-xl border border-espresso-100/50 p-8 rounded-3xl shadow-sm text-center text-espresso-400 text-xs">
          Gathering insights...
        </div>
      );

      const values = data.map(d => d[metric]);
      const maxVal = Math.max(...values, 1) * 1.1; 
      const minVal = 0; 
      
      const width = 400;
      const height = 140;
      const paddingX = 0;
      const paddingY = 20;
      
      const graphWidth = width - paddingX * 2;
      const graphHeight = height - paddingY * 2;
      
      const plotData = data.length === 1 ? [data[0], data[0]] : data;
      
      const coords = plotData.map((d, i) => [
        paddingX + (i / (plotData.length - 1)) * graphWidth,
        height - paddingY - ((d[metric] - minVal) / (maxVal - minVal || 1)) * graphHeight
      ]);
      
      const generateCurve = (pts) => {
        if (pts.length < 2) return '';
        let d = `M ${pts[0][0]},${pts[0][1]}`;
        for (let i = 0; i < pts.length - 1; i++) {
          const p0 = pts[Math.max(0, i - 1)];
          const p1 = pts[i];
          const p2 = pts[i + 1];
          const p3 = pts[Math.min(pts.length - 1, i + 2)];
          
          const cp1x = p1[0] + (p2[0] - p0[0]) * 0.15;
          const cp1y = p1[1] + (p2[1] - p0[1]) * 0.15;
          const cp2x = p2[0] - (p3[0] - p1[0]) * 0.15;
          const cp2y = p2[1] - (p3[1] - p1[1]) * 0.15;
          
          d += ` C ${cp1x},${cp1y} ${cp2x},${cp2y} ${p2[0]},${p2[1]}`;
        }
        return d;
      };

      const pathData = generateCurve(coords);
      
      const firstX = coords[0][0];
      const lastX = coords[coords.length - 1][0];
      const baseY = height;
      const fillPathData = `${pathData} L ${lastX},${baseY} L ${firstX},${baseY} Z`;

      const isPositive = values[values.length - 1] >= values[0];
      const strokeColor = isPositive ? '#10B981' : '#F43F5E'; 
      const glowColor = isPositive ? 'rgba(16, 185, 129, 0.4)' : 'rgba(244, 63, 94, 0.4)';

      const total = values.reduce((sum, val) => sum + val, 0);

      const handleMouseMove = (e) => {
        if (!graphRef.current) return;
        const rect = graphRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const ratio = x / rect.width;
        let idx = Math.round(ratio * (plotData.length - 1));
        idx = Math.max(0, Math.min(plotData.length - 1, idx));
        setHoverIdx(idx);
      };

      return (
        <div 
          className="relative bg-white/90 backdrop-blur-2xl border border-white/40 p-6 rounded-[2rem] space-y-6 overflow-hidden transition-all duration-500 hover:shadow-xl hover:shadow-black/5"
          style={{ boxShadow: '0 8px 32px rgba(0,0,0,0.04), inset 0 0 0 1px rgba(255,255,255,0.5)' }}
        >
          <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-transparent to-current opacity-[0.03] rounded-full blur-3xl -translate-y-1/2 translate-x-1/4 pointer-events-none transition-colors duration-1000" style={{ color: strokeColor }} />

          <div className="relative flex justify-between items-start z-10">
            <div>
              <div className="text-[10px] uppercase tracking-[0.2em] font-extrabold text-espresso-400/80 mb-2 flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: strokeColor }} />
                30-Day {metric}
              </div>
              <div className="text-4xl font-display text-espresso-950 tracking-tight flex items-baseline gap-1 transition-all duration-500">
                <span className="text-lg text-espresso-400 font-sans tracking-normal">{metric === 'revenue' ? 'Rs.' : ''}</span>
                {total.toLocaleString()}
              </div>
              
              <div className="h-4 mt-1">
                <div className={`text-xs font-medium transition-all duration-300 ${hoverIdx !== null ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-1'}`} style={{ color: strokeColor }}>
                  {hoverIdx !== null && (
                    <>
                      {new Date(plotData[hoverIdx].date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}: 
                      <span className="font-bold ml-1">
                        {metric === 'revenue' ? 'Rs. ' : ''}{plotData[hoverIdx][metric].toLocaleString()}
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="flex bg-espresso-50/50 backdrop-blur-md p-1.5 rounded-xl border border-espresso-100/50 shadow-inner">
              {['revenue', 'orders'].map(m => (
                <button 
                  key={m}
                  onClick={() => { setMetric(m); setHoverIdx(null); }}
                  className={`px-4 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all duration-300 ${metric === m ? 'bg-white shadow-sm text-espresso-950 scale-105' : 'text-espresso-400 hover:text-espresso-600'}`}
                >
                  {m === 'revenue' ? 'Rev' : 'Ord'}
                </button>
              ))}
            </div>
          </div>
          
          <div 
            ref={graphRef}
            className="relative w-full overflow-hidden mt-4 cursor-crosshair group" 
            style={{ height: '140px' }}
            onMouseMove={handleMouseMove}
            onMouseLeave={() => setHoverIdx(null)}
            onTouchMove={(e) => {
              if (e.touches.length > 0) {
                const rect = graphRef.current.getBoundingClientRect();
                const x = e.touches[0].clientX - rect.left;
                const ratio = x / rect.width;
                let idx = Math.round(ratio * (plotData.length - 1));
                idx = Math.max(0, Math.min(plotData.length - 1, idx));
                setHoverIdx(idx);
              }
            }}
            onTouchEnd={() => setHoverIdx(null)}
          >
            <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full overflow-visible" preserveAspectRatio="none">
              <defs>
                <linearGradient id="gradGreen" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="#10B981" stopOpacity="0.4" />
                  <stop offset="100%" stopColor="#10B981" stopOpacity="0.0" />
                </linearGradient>
                <linearGradient id="gradRed" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="#F43F5E" stopOpacity="0.4" />
                  <stop offset="100%" stopColor="#F43F5E" stopOpacity="0.0" />
                </linearGradient>
                
                <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
                  <feGaussianBlur stdDeviation="4" result="blur" />
                  <feComposite in="SourceGraphic" in2="blur" operator="over" />
                </filter>
              </defs>
              
              <path 
                d={fillPathData}
                fill={isPositive ? 'url(#gradGreen)' : 'url(#gradRed)'}
                className="animate-fade-in-up origin-bottom opacity-80 group-hover:opacity-100 transition-opacity duration-500"
                style={{ animationDuration: '1.2s', animationTimingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)' }}
              />

              <path 
                d={pathData}
                fill="none"
                stroke={strokeColor}
                strokeWidth="3.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                filter="url(#glow)"
                className="animate-draw-line"
                style={{
                  strokeDasharray: '2000',
                  strokeDashoffset: '2000',
                }}
              />

              <path 
                d={pathData}
                fill="none"
                stroke={isPositive ? '#34D399' : '#FB7185'} 
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="animate-draw-line"
                style={{
                  strokeDasharray: '2000',
                  strokeDashoffset: '2000',
                }}
              />
              
              {hoverIdx !== null && (
                <g className="animate-fade-in transition-all duration-200">
                  <line 
                    x1={coords[hoverIdx][0]} y1={0} 
                    x2={coords[hoverIdx][0]} y2={height} 
                    stroke="currentColor" 
                    strokeWidth="1"
                    strokeDasharray="4 4"
                    className="text-espresso-200/50"
                  />
                  <circle 
                    cx={coords[hoverIdx][0]} 
                    cy={coords[hoverIdx][1]} 
                    r="5" 
                    fill="#fff" 
                    stroke={strokeColor} 
                    strokeWidth="3"
                    className="shadow-sm"
                    filter="url(#glow)"
                  />
                </g>
              )}
            </svg>
          </div>
        </div>
      );
    };

    const AdminDashboard = ({ menuData, syncMenuToCloud }) => {
      const [stats, setStats] = useState({ revenue: 0, orders: 0 });
      const [monthlyData, setMonthlyData] = useState([]);
      const [loading, setLoading] = useState(true);

      useEffect(() => {
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);

        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        thirtyDaysAgo.setHours(0, 0, 0, 0);
        
        const unsub = __db.collection('orders')
          .where('timestamp', '>=', thirtyDaysAgo.toISOString())
          .onSnapshot(snap => {
            let todayRev = 0;
            let todayCount = 0;
            
            const dailyStats = {};
            for (let i = 0; i < 30; i++) {
              const d = new Date();
              d.setDate(d.getDate() - (29 - i));
              const dateStr = d.toISOString().split('T')[0];
              dailyStats[dateStr] = { date: dateStr, revenue: 0, orders: 0 };
            }

            snap.docs.forEach(doc => {
              const data = doc.data();
              if (data.status !== 'cancelled' && data.status !== 'received') {
                const docDateStr = data.timestamp.split('T')[0];
                const docTime = new Date(data.timestamp).getTime();
                
                if (docTime >= startOfDay.getTime()) {
                  todayRev += (data.total || 0);
                  todayCount++;
                }

                if (dailyStats[docDateStr]) {
                  dailyStats[docDateStr].revenue += (data.total || 0);
                  dailyStats[docDateStr].orders++;
                }
              }
            });
            
            setStats({ revenue: todayRev, orders: todayCount });
            setMonthlyData(Object.values(dailyStats));
            setLoading(false);
          }, err => {
            console.error('Stats error:', err);
            setLoading(false);
          });
        return () => unsub();
      }, []);

      const toggleStock = async (item) => {
        haptic('light');
        const updatedItem = { ...item, inStock: !item.inStock };
        const finalMenu = menuData.map(m => m.id === item.id ? updatedItem : m);
        try {
          await __db.collection('config').doc('menu').set({ items: finalMenu }, { merge: true });
        } catch (e) {
          showToast("Failed to update stock.", "error");
        }
      };

      return (
        <div className="animate-fade-in space-y-6 pb-20">
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-espresso-950 p-5 rounded-2xl text-sand-50 shadow-md">
              <div className="text-espresso-400 text-[10px] uppercase tracking-widest font-bold mb-1">Today's Revenue</div>
              <div className="text-3xl font-display text-brown-400">
                {loading ? '...' : `Rs. ${stats.revenue}`}
              </div>
            </div>
            <div className="bg-white border border-espresso-100 p-5 rounded-2xl shadow-sm">
              <div className="text-espresso-400 text-[10px] uppercase tracking-widest font-bold mb-1">Orders Today</div>
              <div className="text-3xl font-display text-espresso-950">
                {loading ? '...' : stats.orders}
              </div>
            </div>
          </div>

          <InsightsGraph data={monthlyData} />

          <div>
            <div className="flex items-center justify-between mb-3 px-1">
              <h3 className="text-[10px] text-brown-500 font-bold uppercase tracking-widest">Quick Stock Toggle</h3>
              <span className="text-[10px] text-espresso-400">{menuData.filter(m=>!m.inStock).length} Out of Stock</span>
            </div>
            <div className="bg-white border border-espresso-100 shadow-sm rounded-2xl overflow-hidden">
              {menuData.map((m, i) => (
                <div key={m.id} className={`flex items-center justify-between p-3 ${i !== menuData.length - 1 ? 'border-b border-espresso-50' : ''}`}>
                  <div className="text-sm font-medium text-espresso-950 truncate max-w-[180px]">{m.name}</div>
                  <button 
                    onClick={() => toggleStock(m)}
                    className={`px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider transition-colors ${
                      m.inStock 
                        ? 'bg-green-50 text-green-600 border border-green-200 hover:bg-green-100' 
                        : 'bg-red-50 text-red-600 border border-red-200 hover:bg-red-100'
                    }`}
                  >
                    {m.inStock ? 'In Stock' : 'Out'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      );
    };

    const AdminInventory = ({ menuData, syncMenuToCloud, categories }) => {
      const [search, setSearch] = useState("");
      const [editItem, setEditItem] = useState(null);

      // Bulk Editor State
      const [bulkCategory, setBulkCategory] = useState("");
      const [bulkAmount, setBulkAmount] = useState(0);
      const [bulkType, setBulkType] = useState("fixed");

      const handleBulkUpdate = async () => {
        if (!bulkCategory || bulkAmount === 0) return;
        const confirmStr = `Are you sure you want to change prices for all ${bulkCategory} items by ${bulkType === 'percent' ? bulkAmount + '%' : 'Rs. ' + bulkAmount}?`;
        if (!window.confirm(confirmStr)) return;

        const finalMenu = menuData.map(m => {
          if (m.category === bulkCategory || bulkCategory === "All") {
            let newPrice = m.price;
            if (bulkType === 'fixed') newPrice += bulkAmount;
            if (bulkType === 'percent') newPrice = Math.round(newPrice * (1 + bulkAmount / 100));
            return { ...m, price: Math.max(0, newPrice) };
          }
          return m;
        });

        try {
          await __db.collection('config').doc('menu').set({ items: finalMenu }, { merge: true });
          haptic('success');
          showToast(`Prices updated for ${bulkCategory}`);
          setBulkAmount(0);
        } catch (e) {
          alert("Failed to update bulk prices.");
        }
      };

      const handleSaveItem = async (updatedItem) => {
        setEditItem({...updatedItem, saving: true});
        const finalMenu = menuData.map(m => m.id === updatedItem.id ? updatedItem : m);
        if (!menuData.find(m => m.id === updatedItem.id)) finalMenu.unshift(updatedItem);

        try {
          await __db.collection('config').doc('menu').set({ items: finalMenu }, { merge: true });
          haptic('success');
          setEditItem(null);
        } catch (e) {
          alert("Failed to save changes.");
          setEditItem({...updatedItem, saving: false});
        }
      };

      if (editItem) return <AdminItemForm item={editItem} onSave={handleSaveItem} onCancel={()=>setEditItem(null)} categories={categories} />;

      return (
        <div className="animate-fade-in space-y-6 pb-20">
          <div className="bg-white p-4 rounded-2xl border border-espresso-100 shadow-sm">
            <h3 className="text-brown-500 font-bold tracking-widest text-xs uppercase mb-3">Bulk Price Editor</h3>
            <div className="flex gap-2 mb-2">
              <select value={bulkCategory} onChange={e=>setBulkCategory(e.target.value)} className="flex-1 bg-sand-50 border border-espresso-200 rounded-lg px-2 py-1 text-xs outline-none focus:border-brown-500 text-espresso-900">
                <option value="">Select Category...</option>
                <option value="All">All Items</option>
                {categories.map(c => <option key={c.id} value={c.label}>{c.label}</option>)}
              </select>
              <select value={bulkType} onChange={e=>setBulkType(e.target.value)} className="w-24 bg-sand-50 border border-espresso-200 rounded-lg px-2 py-1 text-xs outline-none focus:border-brown-500 text-espresso-900">
                <option value="fixed">Rs (+/-)</option>
                <option value="percent">% (+/-)</option>
              </select>
            </div>
            <div className="flex gap-2">
              <input type="number" value={bulkAmount} onChange={e=>setBulkAmount(parseInt(e.target.value)||0)} placeholder="Amount" className="flex-1 bg-sand-50 border border-espresso-200 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-brown-500 text-espresso-900" />
              <button onClick={handleBulkUpdate} className="bg-espresso-900 text-sand-50 px-4 py-1.5 rounded-lg text-xs font-bold active:scale-95 transition-transform">Apply</button>
            </div>
          </div>

          <div className="flex gap-2">
            <div className="relative flex-1">
              <Icons.Search className="absolute left-4 top-1/2 -translate-y-1/2 text-espresso-500 w-5 h-5 pointer-events-none" />
              <input type="text" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search inventory..." className="w-full bg-white border border-espresso-200 rounded-2xl py-3 pl-12 pr-4 text-sm focus:outline-none focus:border-brown-500 transition-colors text-espresso-950 shadow-sm" />
            </div>
            <button onClick={()=>setEditItem({ id: 'new_'+Date.now(), name:'', price:100, category: categories[0]?.label || '', subCategory:'other', subCategoryLabel:'Other', inStock:true, foodType:'veg', imageUrl:'', description:'', flavorProfile:[], isSignatureItem:false })} className="w-12 h-12 bg-espresso-900 rounded-2xl flex items-center justify-center text-white active:scale-95 shrink-0 shadow-sm"><Icons.Plus className="w-6 h-6" /></button>
          </div>

          <div className="space-y-3">
             {(search ? menuData.filter(m => fuzzyMatch(search, m.name) > 0) : menuData).map(m => (
                <div key={m.id} className="flex items-center justify-between p-4 bg-white border border-espresso-100 shadow-sm rounded-2xl cursor-pointer hover:bg-sand-100 transition-colors" onClick={()=>setEditItem(m)}>
                  <div className="flex items-center gap-3">
                    <img src={m.imageUrl} alt="" className={`w-12 h-12 rounded-xl object-cover ${!m.inStock?'grayscale opacity-50':''}`} />
                    <div>
                      <div className="text-sm font-medium text-espresso-950 flex items-center gap-1">{m.name} {m.foodType === 'veg' ? <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span> : m.foodType === 'non-veg' ? <span className="w-1.5 h-1.5 rounded-full bg-red-500"></span> : null}</div>
                      <div className="text-xs text-brown-500 font-bold font-price">Rs. {m.price}</div>
                    </div>
                  </div>
                  <div className={`text-[10px] uppercase font-bold px-2 py-1 rounded ${m.inStock ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-500'}`}>{m.inStock ? 'In Stock' : 'Out'}</div>
                </div>
             ))}
          </div>
        </div>
      );
    };

    const AdminItemForm = ({ item, onSave, onCancel, categories }) => {
      const [formData, setFormData] = useState(item);

      return (
         <div className="animate-fade-in pb-32">
           <div className="flex justify-between items-center mb-6">
              <button className="text-sm text-espresso-600 flex items-center gap-1 active:text-espresso-950 bg-sand-200 border border-sand-300 px-3 py-1.5 rounded-full" onClick={onCancel}><Icons.ArrowLeft className="w-4 h-4"/> Back</button>
              <h2 className="font-display text-xl text-espresso-950">{item.name ? 'Edit Dish' : 'New Dish'}</h2>
           </div>

           <div className="space-y-5">
              {/* Dish Image Upload */}
              <div>
                <label className="text-[10px] text-espresso-400 uppercase tracking-widest block mb-2 font-bold">Dish Photo</label>
                <ImageUploadZone 
                  value={formData.imageUrl} 
                  onChange={(url) => setFormData({...formData, imageUrl: url})}
                  storagePath={`menu/${formData.id || Date.now()}.jpg`}
                  aspect="4/5"
                  label="Upload Dish Photo"
                />
              </div>

              <div className="flex gap-4">
                 <div className="flex-1 space-y-2">
                    <div>
                      <label className="text-[10px] text-espresso-400 uppercase tracking-widest block mb-1 font-bold">Dish Name</label>
                      <input type="text" value={formData.name} onChange={e=>setFormData({...formData, name: e.target.value})} className="w-full bg-sand-50 border border-espresso-200 rounded-lg px-3 py-2 text-sm text-espresso-950 focus:outline-none focus:border-brown-500 shadow-sm" />
                    </div>
                    <div className="flex gap-2">
                      <div className="flex-1">
                        <label className="text-[10px] text-espresso-400 uppercase tracking-widest block mb-1 font-bold">Price (Rs)</label>
                        <input type="number" value={formData.price} onChange={e=>setFormData({...formData, price: parseInt(e.target.value)||0})} className="w-full bg-sand-50 border border-espresso-200 rounded-lg px-3 py-2 text-sm text-espresso-950 focus:outline-none focus:border-brown-500 font-price shadow-sm" />
                      </div>
                      <div className="flex-1">
                        <label className="text-[10px] text-espresso-400 uppercase tracking-widest block mb-1 font-bold">Category</label>
                        <select value={formData.category} onChange={e=>setFormData({...formData, category: e.target.value})} className="w-full bg-sand-50 border border-espresso-200 rounded-lg px-3 py-2 text-sm text-espresso-950 focus:outline-none focus:border-brown-500 appearance-none shadow-sm">
                           {categories.filter(c=>c.id !== 'All').map(c => <option key={c.id} value={c.label}>{c.label}</option>)}
                        </select>
                      </div>
                    </div>
                 </div>
              </div>

              <div>
                <label className="text-[10px] text-espresso-400 uppercase tracking-widest block mb-1 font-bold">Description</label>
                <textarea value={formData.description} onChange={e=>setFormData({...formData, description: e.target.value})} rows="2" className="w-full bg-sand-50 border border-espresso-200 rounded-lg px-3 py-2 text-sm text-espresso-950 focus:outline-none focus:border-brown-500 resize-none shadow-sm" />
              </div>

              <div className="bg-white border border-espresso-100 rounded-2xl p-4 shadow-sm mt-4">
                 <label className="text-[10px] text-espresso-400 uppercase tracking-widest block mb-2 font-bold">Food Type</label>
                 <div className="flex gap-2">
                    <button onClick={()=>setFormData({...formData, foodType: 'veg'})} className={`flex-1 py-2 px-3 rounded-lg text-sm font-bold transition-colors ${formData.foodType === 'veg' ? 'bg-green-500 text-white' : 'bg-sand-100 text-espresso-600 border border-espresso-200'}`}>
                       <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-green-700"></span> Veg</span>
                    </button>
                    <button onClick={()=>setFormData({...formData, foodType: 'non-veg'})} className={`flex-1 py-2 px-3 rounded-lg text-sm font-bold transition-colors ${formData.foodType === 'non-veg' ? 'bg-red-500 text-white' : 'bg-sand-100 text-espresso-600 border border-espresso-200'}`}>
                       <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-red-700"></span> Non-Veg</span>
                    </button>
                    <button onClick={()=>setFormData({...formData, foodType: 'none'})} className={`flex-1 py-2 px-3 rounded-lg text-sm font-bold transition-colors ${formData.foodType === 'none' || !formData.foodType ? 'bg-espresso-900 text-white' : 'bg-sand-100 text-espresso-600 border border-espresso-200'}`}>
                       None
                    </button>
                 </div>
              </div>

              <div className="bg-white border border-espresso-100 rounded-2xl p-4 flex justify-between items-center shadow-sm">
                 <div>
                    <div className="text-sm font-bold text-espresso-950 mb-0.5">Stock Status</div>
                    <div className="text-[10px] text-espresso-500">Is this dish currently available?</div>
                 </div>
                 <button className={`w-12 h-6 rounded-full relative transition-colors ${formData.inStock !== false ? 'bg-espresso-900' : 'bg-espresso-200'}`} onClick={()=>setFormData({...formData, inStock: formData.inStock === false ? true : false})}>
                    <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${formData.inStock !== false ? 'left-7' : 'left-1'}`}></div>
                 </button>
              </div>

              <button disabled={formData.saving} onClick={()=>onSave(formData)} className="w-full py-4 rounded-xl font-bold bg-espresso-900 text-sand-50 mt-6 active:scale-95 transition-transform disabled:opacity-50 text-[15px] shadow-lg">
                 {formData.saving ? 'Saving to Database...' : 'Save Changes'}
              </button>
           </div>
         </div>
      );
    };

    const AdminOrders = () => {
      const [orders, setOrders] = useState([]);
      const [loading, setLoading] = useState(true);
      const [error, setError] = useState(null);

      useEffect(() => {
        const unsub = __db.collection('orders')
          .limit(100)
          .onSnapshot(snap => {
            const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            items.sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));
            setOrders(items);
            setLoading(false);
            setError(null);
          }, err => {
            console.error('Orders fetch error:', err);
            setError(err.message);
            setLoading(false);
          });
        return () => unsub();
      }, []);

      const updateStatus = async (orderId, newStatus) => {
        if (!orderId) {
          showToast('Order ID is missing', 'error');
          return;
        }
        try {
          await __db.collection('orders').doc(orderId).update({ status: newStatus });
          haptic('light');
          showToast(`Status updated to ${newStatus}`, 'success');
        } catch(e) {
          console.error('Update status error:', e);
          showToast('Failed to update status: ' + (e.message || 'Unknown error'), 'error');
        }
      };

      const statusSteps = [
        { key: 'pending', label: 'Received' },
        { key: 'confirmed', label: 'Confirmed' },
        { key: 'preparing', label: 'Preparing' },
        { key: 'done', label: 'Done' }
      ];

      if (loading) {
        return (
          <div className="flex items-center justify-center py-20">
            <div className="text-espresso-400 text-sm">Loading orders...</div>
          </div>
        );
      }

      if (error) {
        const isPermissionError = error.toLowerCase().includes('permission');
        return (
          <div className="text-center py-20">
            <div className="text-red-400 text-sm mb-2">Error loading orders</div>
            <div className="text-espresso-400 text-xs mb-4 max-w-xs mx-auto">{error}</div>
            {isPermissionError && (
              <div className="mt-4 p-4 bg-espresso-900/50 border border-espresso-800 rounded-xl max-w-sm mx-auto text-left">
                <div className="text-brown-400 text-xs font-bold uppercase mb-2">Admin permissions required</div>
                <div className="text-espresso-300 text-[11px] leading-relaxed mb-3">
                  Sign in with an authorized admin account. Do not loosen Firestore rules in production.
                </div>
              </div>
            )}
          </div>
        );
      }

      if (orders.length === 0) {
        return (
          <div className="text-center py-20">
            <div className="text-espresso-500 text-sm mb-2">No orders yet</div>
            <div className="text-espresso-400 text-xs">Orders will appear here when customers place them</div>
          </div>
        );
      }

      return (
        <div className="animate-fade-in space-y-4 pb-20">
          {orders.map(order => (
            <div 
              key={order.id} 
              className="bg-white border border-espresso-100 shadow-sm rounded-2xl p-4"
            >
              <div className="flex justify-between items-start mb-3">
                <div>
                  <div className="text-espresso-950 font-bold text-sm">{order.id}</div>
                  <div className="text-espresso-400 text-[10px]">
                    {order.timestamp ? new Date(order.timestamp).toLocaleString('en-US', { 
                      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' 
                    }) : '--'}
                  </div>
                </div>
                <div className="text-brown-500 font-bold text-sm">Rs. {order.total || 0}</div>
              </div>

              <div className="mb-4 space-y-1">
                {order.items?.map((item, idx) => (
                  <div key={idx} className="flex justify-between text-[12px]">
                    <span className="text-espresso-800">{item.qty}x {item.name}</span>
                    <span className="text-espresso-500">Rs. {(item.price || 0) * item.qty}</span>
                  </div>
                ))}
              </div>

              {order.note && (
                <div className="mb-4 p-2 rounded-lg bg-sand-50 border border-sand-200">
                  <div className="text-[10px] text-espresso-400 uppercase mb-1">Note</div>
                  <div className="text-espresso-800 text-[12px]">{order.note}</div>
                </div>
              )}

              <div className="flex gap-2 flex-wrap">
                {statusSteps.map(step => {
                  const isActive = order.status === step.key;
                  return (
                    <button
                      key={step.key}
                      onClick={() => updateStatus(order.id, step.key)}
                      className={`px-3 py-2 rounded-full text-[10px] font-bold uppercase tracking-wider transition-all ${
                        isActive 
                          ? 'bg-espresso-900 text-white shadow-sm' 
                          : 'bg-white text-espresso-400 border border-espresso-200 hover:text-brown-500'
                      }`}
                    >
                      {step.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      );
    };

    
    const AdminScreen = memo(({ close, menuData, syncMenuToCloud, updateItemStock, appConfig, categories, syncCategories }) => {
      const [email, setEmail] = useState("");
      const [password, setPassword] = useState("");
      const [auth, setAuth] = useState(false);
      const [loading, setLoading] = useState(true);
      const [errorMsg, setErrorMsg] = useState("");
      const [tab, setTab] = useState('dashboard');

      useEffect(() => {
        const unsubscribe = __auth.onAuthStateChanged(user => {
          if (user) {
            setAuth(true);
          } else {
            setAuth(false);
          }
          setLoading(false);
        });
        return () => unsubscribe();
      }, []);

      const saveGlobals = async (updates) => {
        await __db.collection('config').doc('globals').set(updates, { merge: true });
      };

      const handleLogin = async (e) => {
        e.preventDefault();
        setErrorMsg("");
        try {
          await __auth.signInWithEmailAndPassword(email, password);
          haptic('success');
        } catch (error) {
          haptic('error');
          setErrorMsg(error.message);
        }
      };

      const handleLogout = async () => {
        await __auth.signOut();
      };

      if (loading) {
        return <div className="fixed inset-0 z-[10000] flex items-center justify-center text-espresso-950 bg-sand-200">Loading...</div>;
      }

      if (!auth) {
        return (
          <div className="fixed inset-0 z-[10000] flex flex-col items-center justify-center animate-fade-in text-espresso-950 p-6 pt-safe pb-safe textured-ground" style={{ background: 'var(--s-ground)' }}>
            <button className="absolute top-6 left-6 w-12 h-12 flex items-center justify-center text-espresso-400" aria-label="Close Admin" onClick={close}><Icons.X className="w-6 h-6"/></button>
            <Icons.Leaf className="w-16 h-16 text-brown-500 mb-8" />
            <h2 className="font-display text-3xl mb-10">Admin Login</h2>
            <form onSubmit={handleLogin} className="flex flex-col gap-4 w-full max-w-sm">
              <input 
                type="email" 
                placeholder="Admin Email" 
                value={email} 
                onChange={e => setEmail(e.target.value)} 
                className="px-4 py-3 rounded-xl border border-espresso-200 focus:outline-none focus:border-brown-500"
                required
              />
              <input 
                type="password" 
                placeholder="Password" 
                value={password} 
                onChange={e => setPassword(e.target.value)} 
                className="px-4 py-3 rounded-xl border border-espresso-200 focus:outline-none focus:border-brown-500"
                required
              />
              {errorMsg && <p className="text-red-500 text-sm text-center">{errorMsg}</p>}
              <button type="submit" className="bg-brown-600 text-white font-medium py-3 rounded-xl mt-2 active:scale-95 transition-transform">
                Sign In
              </button>
            </form>
          </div>
        );
      }

      return (
        <div className="fixed inset-0 z-[10000] text-espresso-950 animate-fade-in flex flex-col font-sans textured-ground" style={{ background: 'var(--s-ground)' }}>
          <div className="p-4 mt-safe flex justify-between items-center shrink-0" style={{ borderBottom: '1px solid var(--glass-border)', background: 'var(--glass-bg)', backdropFilter: 'var(--glass-blur)' }}>
            <h2 className="font-brand text-xl text-espresso-950" style={{ fontWeight: 600 }}>Dashboard</h2>
            <button className="text-sm px-3 py-1.5 rounded-full text-espresso-900 active:scale-95 transition-transform bg-sand-200 border border-sand-300" onClick={close}>Close</button>
          </div>
          <div className="px-5 py-4 shrink-0 border-b border-espresso-100/30 bg-white/40 backdrop-blur-2xl z-10 sticky top-0">
            <div className="flex overflow-x-auto hide-scrollbar pb-1 -mb-1">
              <div className="inline-flex bg-espresso-50/80 p-1.5 rounded-2xl border border-espresso-100/50 shadow-inner gap-1 mx-auto">
                {[
                  { id: 'dashboard', label: 'Dashboard' },
                  { id: 'orders', label: 'Orders' },
                  { id: 'inventory', label: 'Inventory' },
                  { id: 'specials', label: 'Specials' },
                  { id: 'categories', label: 'Categories' },
                  { id: 'settings', label: 'Config' }
                ].map(t => (
                  <button 
                    key={t.id}
                    onClick={() => setTab(t.id)}
                    className={`relative px-5 py-2 rounded-xl text-[10px] font-bold uppercase tracking-[0.2em] transition-all duration-500 whitespace-nowrap flex items-center justify-center min-w-[90px] ${tab === t.id ? 'text-espresso-950 scale-[1.02]' : 'text-espresso-400 hover:text-espresso-600 hover:bg-black/5'}`}
                  >
                    {tab === t.id && (
                      <div className="absolute inset-0 bg-white rounded-xl shadow-[0_4px_12px_rgba(0,0,0,0.05)] border border-white/80 z-0 animate-fade-in-up" style={{ animationDuration: '0.3s' }} />
                    )}
                    <span className="relative z-10">{t.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-6 hide-scrollbar relative">
             {tab === 'dashboard' && <AdminDashboard menuData={menuData} syncMenuToCloud={syncMenuToCloud} />}
             {tab === 'orders' && <AdminOrders />}
             {tab === 'inventory' && <AdminInventory menuData={menuData} syncMenuToCloud={syncMenuToCloud} categories={categories} />}
             {tab === 'specials' && <AdminSpecials menuData={menuData} />}
             {tab === 'categories' && <AdminCategories categories={categories} syncCategories={syncCategories} menuData={menuData} syncMenuToCloud={syncMenuToCloud} />}
             {tab === 'settings' && <AdminSettings appConfig={appConfig} saveGlobals={saveGlobals} />}
          </div>
        </div>
      );
    });

    // ─── App Root ───
    const App = () => {
      const [loading, setLoading] = useState(true);
      const [showLoadingOverlay, setShowLoadingOverlay] = useState(true);
      const [view, setView] = useState(() => {
        const path = window.location.pathname.replace(/\/$/, '');
        if (path === '/admin' || window.location.hash === '#admin') return 'admin';
        return 'landing';
      });
      const [activeCategory, setActiveCategory] = useState('All');
      const [detailItem, setDetailItem] = useState(null);
      const [cartOpen, setCartOpen] = useState(false);
      const [menuData, setMenuData] = useState(INITIAL_STATIC_MENU);
      const [appConfig, setAppConfig] = useState({ aiName: "Satkar", heroBg: "https://images.unsplash.com/photo-1554118811-1e0d58224f24?w=1200&q=85&auto=format&fit=crop" });
      
            const [appCategories, setAppCategories] = useState(INITIAL_CATEGORIES);
const context = useSmartContext();
      const loyalty = useLoyalty();
      const recentlyViewed = useRecentlyViewed(menuData);
      const cart = useCart();

      useEffect(() => {
        const unsubConfig = __db.collection('config').doc('globals').onSnapshot(snap => {
          if (snap.exists) { 
            const data = snap.data();
            setAppConfig(p => ({ 
              ...p, 
              ...data,
              heroBg: data.heroBg || p.heroBg 
            })); 
          }
        }, err => console.error("Global config sync error:", err));
        const unsubCats = __db.collection('config').doc('categories').onSnapshot(snap => {
          if (snap.exists && snap.data().items) { setAppCategories(snap.data().items); }
          else { __db.collection('config').doc('categories').set({ items: INITIAL_CATEGORIES }).catch(err => console.error("Could not init categories", err)); }
        }, err => console.error("Category sync error:", err));

        // ONE-TIME MIGRATE: Force update the cloud menu with the new transcribed local RAW_MENU
        if (!localStorage.getItem('menu_migrated_v4')) {
          console.log("Pushing new transcribed menu to Firebase...");
          __db.collection('config').doc('menu').set({ items: INITIAL_STATIC_MENU }).then(() => {
             localStorage.setItem('menu_migrated_v4', 'true');
          }).catch(err => { console.error("Could not init config globals", err); showToast("Failed to initialize config", "error"); });
        }

        const unsub = __db.collection('config').doc('menu').onSnapshot(snap => {
          if (snap.exists && snap.data().items) {
            setMenuData(snap.data().items);
            setLoading(false);
          } else {
            // Write initial
            __db.collection('config').doc('menu').set({ items: INITIAL_STATIC_MENU }).catch(err => { console.error("Could not init menu", err); showToast("Failed to initialize menu", "error"); });
            setLoading(false);
          }
        }, err => {
          console.error("Menu sync error:", err);
          showToast("Offline Mode. Using local data.", "error");
          setLoading(false);
        });
        return () => { unsub(); unsubConfig && unsubConfig(); unsubCats(); };
      }, []);

      useEffect(() => {
        const handleNavigation = () => {
          const path = window.location.pathname.replace(/\/$/, '');
          if (path === '/admin' || window.location.hash === '#admin') {
            setView('admin');
          } else if (view === 'admin') {
            setView('landing');
          }
        };
        window.addEventListener('popstate', handleNavigation);
        window.addEventListener('hashchange', handleNavigation);
        return () => {
          window.removeEventListener('popstate', handleNavigation);
          window.removeEventListener('hashchange', handleNavigation);
        };
      }, [view]);

      const syncMenuToCloud = async () => {
        try {
          await __db.collection('config').doc('menu').set({ items: menuData });
          haptic('success');
          showToast("Menu synced to cloud successfully.");
        } catch(e) { showToast("Failed to sync menu: " + e.message, 'error'); }
      };

      const updateItemStock = async (id, inStock) => {
        const nm = menuData.map(m => m.id === id ? { ...m, inStock } : m);
        setMenuData(nm);
        try {
          await __db.collection('config').doc('menu').set({ items: nm }, { merge: true });
        } catch(e) { showToast("Cloud update failed, saved locally", "error"); }
      };

      const placeOrder = async (note) => {
        const orderId = 'ORD-' + Date.now().toString(36).toUpperCase().slice(-6);
        const serviceCharge = Math.round(cart.total * SERVICE_CHARGE_RATE);
        const grandTotal = cart.total + serviceCharge;
        
        try {
          await __db.collection('orders').doc(orderId).set({
            items: cart.cart.map(c => ({ name: c.item.name, qty: c.qty, price: c.item.price })),
            total: grandTotal,
            note: note || "",
            status: 'pending',
            timestamp: new Date().toISOString()
          });
        } catch (e) {
          console.error("Failed to save order to db", e);
        }

        // Build WhatsApp message
        let message = `*New Order - Satkar Cafe*\n\n`;
        message += `*Order ID:* ${orderId}\n`;
        message += `*Date:* ${new Date().toLocaleString()}\n\n`;
        message += `*Items:*\n`;
        cart.cart.forEach(c => {
          message += `• ${c.qty}x ${c.item.name} - Rs. ${(c.item.price * c.qty).toLocaleString()}\n`;
        });
        message += `\n*Subtotal:* Rs. ${cart.total.toLocaleString()}\n`;
        message += `*Service Charge (10%):* Rs. ${serviceCharge.toLocaleString()}\n`;
        message += `*Total:* Rs. ${grandTotal.toLocaleString()}\n`;
        if (note) {
          message += `\n*Note:* ${note}\n`;
        }
        message += `\nPlease confirm my order. Thank you!`;

        // Encode message for URL
        const encodedMessage = encodeURIComponent(message);
        const whatsappUrl = `https://wa.me/9779858427130?text=${encodedMessage}`;
        
        // Open WhatsApp
        window.open(whatsappUrl, '_blank');
        
        // Don't close sheet immediately, User will close it via "Close Cart" button which appears on success
        loyalty.addOrder(cart.total);
        cart.clearCart();
        
        haptic('success');
      };

      const handleSetDetailItem = (item) => {
        if (item) recentlyViewed.addRecent(item);
        setDetailItem(item);
      };

      const syncCategories = async (items) => {
        try {
          await __db.collection('config').doc('categories').set({ items });
          haptic('success');
        } catch(e) { showToast("Category sync failed", "error"); }
      };

      const [adminClicks, setAdminClicks] = useState(0);
      const [lastClick, setLastClick] = useState(0);
      const handleAdminTrigger = () => {
        const now = Date.now();
        if (now - lastClick > 5000) { 
          setAdminClicks(1);
        } else {
          const next = adminClicks + 1;
          if (next >= 5) { 
            window.history.pushState({}, '', '/admin');
            setView('admin'); 
            setAdminClicks(0); 
          }
          else { setAdminClicks(next); }
        }
        setLastClick(now);
      };

      if (view === 'admin') {
        return (
          <>
            {showLoadingOverlay && <LoadingScreen isDataReady={!loading} onComplete={() => setShowLoadingOverlay(false)} />}
            <AdminScreen 
              close={() => { window.history.pushState({}, '', '/'); setView('landing'); }} 
              menuData={menuData}
              syncMenuToCloud={syncMenuToCloud}
              updateItemStock={updateItemStock}
              appConfig={appConfig}
              categories={appCategories}
              syncCategories={syncCategories}
            />
          </>
        );
      }

      return (
        <>
          {showLoadingOverlay && <LoadingScreen isDataReady={!loading} onComplete={() => setShowLoadingOverlay(false)} />}
          <div className={`w-full max-w-lg mx-auto min-h-screen border-x border-sand-100 shadow-2xl relative overflow-x-hidden textured-ground ambient-bg theme-${context.timeOfDay}`} style={{ background: 'var(--bg-ambient)' }}>
          {view === 'landing' && (
            <LandingScreen categories={appCategories} 
              context={context} 
              setView={setView} 
              setActiveCategory={setActiveCategory}
              loyalty={loyalty}
              recent={recentlyViewed.recent}
              setDetailItem={handleSetDetailItem}
              menuData={menuData}
              appConfig={appConfig}
              cartCount={cart.count}
            />
          )}

          {view === 'menu' && (
            <MenuGalleryScreen categories={appCategories} 
              activeCategory={activeCategory}
              setActiveCategory={setActiveCategory}
              setDetailItem={handleSetDetailItem}
              addToCart={(item, qty) => cart.addToCart(item, qty)}
              back={() => setView('landing')}
              menuData={menuData}
            />
          )}

          {view === 'assistant' && (
            <AssistantScreen 
              context={context}
              back={() => setView('landing')}
              setDetailItem={handleSetDetailItem}
              menuData={menuData}
              appConfig={appConfig}
            />
          )}

          {view === 'assistant' && (
            <AssistantScreen 
              context={context}
              back={() => setView('landing')}
              setDetailItem={handleSetDetailItem}
              menuData={menuData}
              appConfig={appConfig}
            />
          )}

          {detailItem && (
            <ItemDetailSheet 
              item={detailItem} 
              onClose={() => setDetailItem(null)} 
              addToCart={cart.addToCart} 
              menuData={menuData}
            />
          )}

          {cartOpen && (
            <CartSheet 
              isOpen={cartOpen}
              onClose={() => setCartOpen(false)}
              cart={cart}
              placeOrder={placeOrder}
            />
          )}

          {!cartOpen && cart.count > 0 && <CartBar count={cart.count} total={cart.total} onOpen={() => setCartOpen(true)} />}

          {/* Sticky Bottom Navigation */}
          {view !== 'admin' && !cartOpen && (
            <nav className="fixed bottom-0 left-0 right-0 z-[998] pb-safe" aria-label="Main Navigation">
              <div 
                className="mx-3 mb-2.5 flex items-center justify-around py-2.5 px-2"
                style={{ 
                  background: 'rgba(28, 18, 8, 0.92)',
                  backdropFilter: 'blur(24px) saturate(180%)',
                  WebkitBackdropFilter: 'blur(24px) saturate(180%)',
                  borderRadius: '24px',
                  border: '1px solid rgba(160, 120, 90, 0.18)',
                  boxShadow: '0 -10px 40px -5px rgba(0,0,0,0.35), 0 0 25px rgba(217, 174, 99, 0.04), inset 0 1px 0 rgba(255, 255, 255, 0.05)'
                }}
              >
                {[
                  { key: 'landing', label: 'Home', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg> },
                  { key: 'menu', label: 'Menu', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5"><path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/></svg> },
                  { key: 'assistant', label: 'AI', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5"><path d="M12 2a3 3 0 0 0-3 3v1a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/><path d="M19 10H5a2 2 0 0 0-2 2v1a7 7 0 0 0 14 0v-1a2 2 0 0 0-2-2z"/><line x1="12" y1="18" x2="12" y2="22"/></svg> },
                  { key: 'cart', label: 'Cart', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg> },
                ].map(tab => {
                  const isActive = tab.key === 'cart' ? cartOpen : (view === tab.key || (tab.key === 'menu' && view === 'menu'));
                  return (
                    <button
                      key={tab.key}
                      className="relative flex flex-col items-center gap-1 transition-all duration-300 select-none group"
                      style={{
                        padding: isActive ? '8px 20px' : '8px 14px',
                        borderRadius: '16px',
                        background: isActive ? 'linear-gradient(135deg, #E8C56A 0%, #B58A44 100%)' : 'transparent',
                        border: isActive ? '1px solid rgba(255, 255, 255, 0.25)' : '1px solid transparent',
                        boxShadow: isActive ? '0 6px 16px rgba(181, 138, 68, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.3)' : 'none',
                        color: isActive ? '#1c1208' : 'rgba(237, 232, 221, 0.55)',
                        transform: isActive ? 'translateY(-2px)' : 'none'
                      }}
                      onClick={() => {
                        haptic('light');
                        if (tab.key === 'cart') { setCartOpen(true); }
                        else { setView(tab.key); if(tab.key === 'menu') setActiveCategory('All'); }
                      }}
                      aria-label={tab.label}
                    >
                      <div className="relative transition-transform duration-300 group-hover:scale-110 group-active:scale-90">
                        {tab.icon}
                        {tab.key === 'cart' && cart.count > 0 && (
                          <span
                            className="absolute -top-2 -right-2.5 w-4 h-4 rounded-full text-[9px] font-bold flex items-center justify-center animate-bounce"
                            style={{ 
                              background: isActive ? '#FEFCF8' : 'linear-gradient(135deg, #E8C56A 0%, #B58A44 100%)', 
                              color: isActive ? '#B58A44' : '#1c1208', 
                              boxShadow: isActive ? '0 2px 5px rgba(0,0,0,0.2)' : '0 2px 6px rgba(181,138,68,0.5)',
                              animationDuration: '2s'
                            }}
                          >
                            {cart.count > 9 ? '9+' : cart.count}
                          </span>
                        )}
                      </div>
                      <span
                        className="text-[9px] font-bold tracking-widest transition-all uppercase"
                        style={{ 
                          color: isActive ? '#1c1208' : 'rgba(237, 232, 221, 0.45)', 
                          letterSpacing: isActive ? '0.08em' : '0.04em' 
                        }}
                      >{tab.label}</span>
                    </button>
                  );
                })}
              </div>
            </nav>
          )}

          {view !== 'admin' && view !== 'assistant' && (
            <footer
              className="w-full py-20 pb-36 px-6 relative overflow-hidden select-none z-10"
              style={{
                background: 'linear-gradient(180deg, #FDFBF7 0%, #F4EFE6 100%)',
                borderTop: '1px solid rgba(217, 174, 99, 0.3)',
                boxShadow: 'inset 0 1px 0 #FFFFFF, 0 -14px 40px -18px rgba(160, 120, 90, 0.15)',
              }}
            >
              {/* Ambient gold glow */}
              <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[420px] h-[420px] rounded-full pointer-events-none -z-10" style={{
                background: 'radial-gradient(circle, rgba(217,174,99,0.18) 0%, transparent 70%)',
                filter: 'blur(40px)',
              }} />

              {/* Paper grain */}
              <div className="absolute inset-0 pointer-events-none opacity-[0.04] -z-10" style={{
                backgroundImage: "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='220' height='220'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85'/></filter><rect width='100%25' height='100%25' filter='url(%23n)'/></svg>\")",
                mixBlendMode: 'multiply',
              }} />

              <div onClick={handleAdminTrigger} className="cursor-pointer max-w-md mx-auto relative">

                {/* Ornamental top mark */}
                <div className="flex items-center justify-center gap-3 mb-7">
                  <span className="h-px w-12" style={{ background: 'linear-gradient(90deg, transparent 0%, rgba(160,120,90,0.45) 100%)' }} />
                  <svg viewBox="0 0 24 24" className="w-3 h-3 text-gold-600" fill="currentColor" aria-hidden="true">
                    <path d="M12 2 L13.5 9.5 L21 11 L13.5 12.5 L12 20 L10.5 12.5 L3 11 L10.5 9.5 Z" />
                  </svg>
                  <span className="h-px w-12" style={{ background: 'linear-gradient(270deg, transparent 0%, rgba(160,120,90,0.45) 100%)' }} />
                </div>

                {/* Brand wordmark */}
                <div className="text-center mb-3">
                  <div className="font-sans text-[9.5px] font-bold tracking-[0.32em] uppercase text-brown-500 mb-3">
                    Est. Doti · Nepal
                  </div>
                  <h2
                    className="font-display text-[34px] leading-[1.02] tracking-[-0.018em] text-espresso-950 mb-1"
                    style={{ fontVariationSettings: "'opsz' 144, 'wght' 420" }}
                  >
                    Satkar
                  </h2>
                  <div className="font-display italic text-[15px] tracking-[0.04em] text-brown-600" style={{ fontVariationSettings: "'opsz' 14, 'wght' 380" }}>
                    Bakery <span className="text-gold-600">&amp;</span> Cafe
                  </div>
                </div>

                {/* Tagline */}
                <p className="mt-5 text-center font-display italic text-[12.5px] leading-[1.6] text-espresso-500 max-w-[280px] mx-auto" style={{ fontVariationSettings: "'opsz' 14, 'wght' 380" }}>
                  &ldquo;Crafting warm moments, aromatic coffee &amp; artisan bakes in the heart of Doti.&rdquo;
                </p>

                {/* Hairline divider */}
                <div className="flex items-center justify-center gap-2 my-9">
                  <span className="h-px w-20" style={{ background: 'linear-gradient(90deg, transparent 0%, rgba(160,120,90,0.35) 100%)' }} />
                  <span className="block w-1 h-1 rounded-full bg-gold-500/60" />
                  <span className="h-px w-20" style={{ background: 'linear-gradient(270deg, transparent 0%, rgba(160,120,90,0.35) 100%)' }} />
                </div>

                {/* Info Rows — refined editorial style */}
                <div className="space-y-0">
                  {/* Hours */}
                  <div className="group flex items-start justify-between gap-4 py-4 border-b border-espresso-950/8 transition-colors">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-[12px] flex items-center justify-center shrink-0" style={{
                        background: 'linear-gradient(135deg, rgba(217,174,99,0.18) 0%, rgba(217,174,99,0.06) 100%)',
                        border: '1px solid rgba(217,174,99,0.30)',
                        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.55), 0 2px 8px -2px rgba(160,120,90,0.18)',
                      }}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-4 h-4 text-gold-700"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                      </div>
                      <div>
                        <div className="text-[8.5px] font-bold tracking-[0.22em] uppercase text-brown-500 mb-0.5">Hours</div>
                        <div className="text-[12.5px] font-semibold text-espresso-950 tracking-tight">Open Daily · 8 AM – 10 PM</div>
                      </div>
                    </div>
                    <span className="text-[8.5px] font-bold tracking-[0.18em] uppercase text-gold-600 mt-1.5 hidden sm:block">01</span>
                  </div>

                  {/* Phone */}
                  <a
                    href="tel:+9779858427130"
                    onClick={(e) => e.stopPropagation()}
                    className="group flex items-start justify-between gap-4 py-4 border-b border-espresso-950/8 hover:text-gold-700 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-[12px] flex items-center justify-center shrink-0 group-hover:scale-105 group-hover:-rotate-6 transition-transform duration-300" style={{
                        background: 'linear-gradient(135deg, rgba(217,174,99,0.18) 0%, rgba(217,174,99,0.06) 100%)',
                        border: '1px solid rgba(217,174,99,0.30)',
                        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.55), 0 2px 8px -2px rgba(160,120,90,0.18)',
                      }}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-4 h-4 text-gold-700"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                      </div>
                      <div>
                        <div className="text-[8.5px] font-bold tracking-[0.22em] uppercase text-brown-500 mb-0.5">Reservations</div>
                        <div className="text-[12.5px] font-semibold tracking-tight tabular-nums text-espresso-950 group-hover:text-gold-700 transition-colors">+977 985&#8202;842&#8202;7130</div>
                      </div>
                    </div>
                    <span className="text-[8.5px] font-bold tracking-[0.18em] uppercase text-gold-600 mt-1.5 hidden sm:block">02</span>
                  </a>

                  {/* Payment */}
                  <div className="group flex items-start justify-between gap-4 py-4 border-b border-espresso-950/8">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className="w-9 h-9 rounded-[12px] flex items-center justify-center shrink-0" style={{
                        background: 'linear-gradient(135deg, rgba(217,174,99,0.18) 0%, rgba(217,174,99,0.06) 100%)',
                        border: '1px solid rgba(217,174,99,0.30)',
                        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.55), 0 2px 8px -2px rgba(160,120,90,0.18)',
                      }}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-4 h-4 text-gold-700"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-[8.5px] font-bold tracking-[0.22em] uppercase text-brown-500 mb-1">Accepted</div>
                        <div className="flex flex-wrap gap-1.5">
                          {['Cash', 'Fonepay', 'QR Scan'].map(p => (
                            <span key={p} className="text-[9.5px] font-semibold tracking-wide px-2 py-[3px] rounded-[7px] text-espresso-800" style={{
                              background: 'rgba(255,255,255,0.6)',
                              border: '1px solid rgba(160,120,90,0.18)',
                              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.6)',
                            }}>
                              {p}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                    <span className="text-[8.5px] font-bold tracking-[0.18em] uppercase text-gold-600 mt-1.5 hidden sm:block">03</span>
                  </div>
                </div>

                {/* CTA + Social */}
                <div className="mt-9">
                  <a
                    href="https://maps.google.com/?q=Satkar+Bakery+Cafe+Dipayal+Doti+Nepal"
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    aria-label="Get directions on Google Maps"
                    className="group relative flex items-center justify-center gap-2.5 w-full py-[15px] rounded-full text-[12.5px] font-bold tracking-[0.22em] uppercase active:scale-[0.98] transition-all duration-300"
                    style={{
                      background: 'linear-gradient(180deg, #E5BC76 0%, #C99A50 60%, #A87B34 100%)',
                      color: '#1c1208',
                      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.55), inset 0 -1px 0 rgba(0,0,0,0.18), 0 14px 40px -12px rgba(168,123,52,0.55), 0 4px 10px -4px rgba(0,0,0,0.18)',
                      letterSpacing: '0.18em',
                    }}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="w-3.5 h-3.5 group-hover:-translate-y-0.5 transition-transform"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                    Get Directions
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" className="w-3 h-3 -mr-1 group-hover:translate-x-1 transition-transform"><path d="M5 12h14M13 5l7 7-7 7"/></svg>
                  </a>

                  <div className="flex items-center justify-center gap-3 mt-6">
                    {[
                      { label: 'Facebook', href: 'https://www.facebook.com/share/1NkZZFaUgb/', path: <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/> },
                      { label: 'Instagram', href: 'https://www.instagram.com/satkarbakerycafe?igsh=azBzMDdlaW5hMjZk', path: <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/> },
                      { label: 'WhatsApp', href: 'https://wa.me/9779858427130', path: <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/> },
                    ].map(s => (
                      <a
                        key={s.label}
                        href={s.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        aria-label={s.label}
                        className="group relative w-11 h-11 flex items-center justify-center rounded-full text-espresso-700 hover:text-gold-700 transition-all duration-300 active:scale-95"
                        style={{
                          background: 'rgba(255,255,255,0.55)',
                          border: '1px solid rgba(160,120,90,0.22)',
                          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.6), 0 4px 12px -4px rgba(160,120,90,0.18)',
                        }}
                      >
                        <span className="absolute inset-0 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" style={{
                          background: 'radial-gradient(circle at 50% 50%, rgba(217,174,99,0.30) 0%, transparent 75%)',
                        }} />
                        <svg viewBox="0 0 24 24" fill="currentColor" className="w-[18px] h-[18px] relative z-10">{s.path}</svg>
                      </a>
                    ))}
                  </div>
                </div>

              </div>

              {/* Bottom signature */}
              <div className="mt-14 max-w-md mx-auto">
                <div className="flex items-center justify-center gap-3 mb-5">
                  <span className="h-px w-10" style={{ background: 'linear-gradient(90deg, transparent 0%, rgba(160,120,90,0.30) 100%)' }} />
                  <span className="font-sans text-[8.5px] font-bold tracking-[0.32em] uppercase text-espresso-400/80">MMXXVI</span>
                  <span className="h-px w-10" style={{ background: 'linear-gradient(270deg, transparent 0%, rgba(160,120,90,0.30) 100%)' }} />
                </div>
                <div className="text-center text-[10px] text-espresso-400/80 font-sans tracking-wide leading-relaxed">
                  <p className="font-medium">© {new Date().getFullYear()} Satkar Bakery &amp; Cafe</p>
                  <p className="mt-0.5 font-light italic text-espresso-400/60">All rights reserved · Made with care in Doti</p>
                </div>

              </div>
            </footer>
          )}
        </div>
        </>
      );
    };

    class ErrorBoundary extends React.Component {
      constructor(p) { super(p); this.state = { err: null }; }
      static getDerivedStateFromError(e) { return { err: e }; }
      render() {
        if (this.state.err) return (
          <div style={{padding:'2rem',textAlign:'center',fontFamily:'sans-serif'}}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{width: '3rem', height: '3rem', margin: '0 auto 1rem', color: '#1c1208'}}>
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            <p style={{fontWeight:600,marginBottom:'0.5rem'}}>Something went wrong</p>
            <p style={{color:'#888',fontSize:'0.875rem',marginBottom:'1.5rem'}}>{this.state.err.message}</p>
            <button onClick={()=>window.location.reload()} style={{background:'#1c1208',color:'#fff',border:'none',borderRadius:'999px',padding:'0.75rem 2rem',cursor:'pointer',fontWeight:600}}>Reload App</button>
          </div>
        );
        return this.props.children;
      }
    }

    export default function AppWithErrorBoundary() {
  return (
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  );
}
