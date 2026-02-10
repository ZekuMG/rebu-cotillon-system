import { useState, useEffect, useCallback } from 'react';
// Asegúrate de que estas exportaciones existan en tu archivo src/data.js
import { INITIAL_MEMBERS, getInitialState } from '../data';

export const useClients = () => {
  // Inicializar estado desde localStorage o usar INITIAL_MEMBERS
  const [members, setMembers] = useState(() =>
    getInitialState('pos_members', INITIAL_MEMBERS)
  );

  // Persistir en cada cambio automáticamente
  useEffect(() => {
    window.localStorage.setItem('pos_members', JSON.stringify(members));
  }, [members]);

  // --- HELPER INTERNO ---
  const generateUUID = () => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  };

  // --- SISTEMA DE VENCIMIENTO (CORE) ---
  // Ahora envuelta en useCallback y parametrizable para DEBUG
  const checkExpirations = useCallback((customThresholdMs = null) => {
    // Por defecto 6 Meses, o el valor que pasemos para debug (ej: 10000ms = 10 seg)
    const SIX_MONTHS_MS = 1000 * 60 * 60 * 24 * 30 * 6;
    const timeThreshold = customThresholdMs !== null ? customThresholdMs : SIX_MONTHS_MS;
    
    const now = new Date();
    const expirationDateLimit = new Date(now.getTime() - timeThreshold);

    console.log(`[SYSTEM] Ejecutando vencimiento de puntos.`);
    console.log(`[SYSTEM] Umbral: ${timeThreshold}ms. Vencen puntos anteriores a: ${expirationDateLimit.toLocaleString()}`);

    setMembers((prevMembers) => {
      let hasChanges = false;
      let expiredCount = 0;

      const updatedMembers = prevMembers.map((member) => {
        if (!member.history || member.points <= 0) return member;

        // 1. Calcular consumidos (FIFO)
        let consumedPoints = member.history
          .filter(h => h.type === 'redeemed' || h.type === 'expired')
          .reduce((acc, h) => acc + (Number(h.points) || 0), 0);

        // 2. Ganancias ordenadas por fecha
        const earnedLogs = member.history
          .filter(h => h.type === 'earned')
          .sort((a, b) => new Date(a.date) - new Date(b.date));

        let pointsToExpireNow = 0;

        // 3. Simulación de consumo
        for (let log of earnedLogs) {
          const logPoints = Number(log.points) || 0;
          const logDate = new Date(log.date);

          if (isNaN(logDate.getTime())) continue;

          if (consumedPoints >= logPoints) {
            consumedPoints -= logPoints;
          } else {
            const remainingFromLog = logPoints - consumedPoints;
            consumedPoints = 0;

            // COMPARACIÓN CONTRA EL UMBRAL (Aquí ocurre la magia del debug)
            if (logDate < expirationDateLimit) {
              pointsToExpireNow += remainingFromLog;
            }
          }
        }

        // 4. Aplicar vencimiento
        if (pointsToExpireNow > 0) {
          hasChanges = true;
          const finalPointsToExpire = Math.min(member.points, pointsToExpireNow);
          
          if (finalPointsToExpire <= 0) return member;

          expiredCount++;
          const newHistoryEntry = {
            id: generateUUID(),
            date: now.toISOString(),
            type: 'expired',
            points: finalPointsToExpire,
            // Diferenciamos si fue automático o debug en el texto
            concept: customThresholdMs !== null 
              ? `Vencimiento DEBUG (Test ${customThresholdMs/1000}s)` 
              : 'Vencimiento automático (6 meses)',
            prevPoints: member.points,
            newPoints: member.points - finalPointsToExpire,
            totalSale: 0,
            orderId: '---'
          };

          return {
            ...member,
            points: member.points - finalPointsToExpire,
            history: [newHistoryEntry, ...member.history]
          };
        }

        return member;
      });

      if (hasChanges) {
        console.log(`[SYSTEM] Se vencieron puntos de ${expiredCount} socios.`);
      }
      return hasChanges ? updatedMembers : prevMembers;
    });
  }, []);

  // Ejecutar chequeo normal (6 meses) al iniciar la app
  useEffect(() => {
    checkExpirations(); // Sin argumentos = usa defecto (6 meses)
  }, [checkExpirations]);


  // --- ACCIONES ---

  const addMember = (memberData) => {
    if (!memberData.name || !memberData.name.trim()) {
      alert('El nombre del socio es obligatorio.');
      return null;
    }

    const maxNumber = members.length > 0 
      ? Math.max(...members.map(m => m.memberNumber || 0)) 
      : 0;
    
    const newMember = {
      id: generateUUID(),
      memberNumber: maxNumber + 1,
      name: memberData.name,
      dni: memberData.dni || '',
      phone: memberData.phone || '',
      email: memberData.email || '',
      extraInfo: memberData.extraInfo || '',
      points: Number(memberData.points) || 0,
      history: [],
    };

    setMembers((prev) => [...prev, newMember]);
    return newMember;
  };

  const updateMember = (id, updates) => {
    setMembers((prev) => 
      prev.map((m) => {
        if (m.id !== id) return m;

        let newHistory = m.history || [];
        let newPoints = m.points;

        if (updates.points !== undefined) {
          const manualPoints = Number(updates.points);
          if (manualPoints !== m.points) {
            const diff = manualPoints - m.points;
            newPoints = manualPoints;

            const adjustmentEntry = {
              id: generateUUID(),
              date: new Date().toISOString(),
              type: diff > 0 ? 'earned' : 'redeemed',
              points: Math.abs(diff),
              concept: 'Ajuste Manual Admin',
              prevPoints: m.points,
              newPoints: manualPoints,
              totalSale: 0,
              orderId: '---'
            };
            newHistory = [adjustmentEntry, ...newHistory];
          }
        }

        return { 
          ...m, 
          ...updates, 
          points: newPoints, 
          history: newHistory 
        };
      })
    );
  };

  const deleteMember = (id) => {
    setMembers((prev) => prev.filter((m) => m.id !== id));
    return true;
  };

  const searchMember = (query) => {
    if (!query) return null;
    const q = query.toLowerCase().trim();
    
    return members.find(m => 
      String(m.memberNumber).includes(q) ||
      (m.dni && m.dni.includes(q)) ||
      (m.phone && m.phone.includes(q)) ||
      (m.email && m.email.toLowerCase().includes(q)) ||
      (m.name && m.name.toLowerCase().includes(q))
    );
  };

  const addPoints = (memberId, totalSaleAmount, orderId) => {
    const pointsEarned = Math.floor(totalSaleAmount / 150);
    
    setMembers((prev) =>
      prev.map((m) => {
        if (m.id !== memberId) return m;

        const currentPoints = m.points || 0;
        const newHistoryEntry = {
          id: generateUUID(),
          date: new Date().toISOString(),
          type: 'earned',
          points: pointsEarned,
          totalSale: totalSaleAmount,
          orderId: orderId || '---',
          prevPoints: currentPoints,
          newPoints: currentPoints + pointsEarned
        };

        return {
          ...m,
          points: currentPoints + pointsEarned,
          history: [newHistoryEntry, ...(m.history || [])],
        };
      })
    );
    return pointsEarned;
  };

  const redeemPoints = (memberId, pointsToRedeem, concept) => {
    let success = false;
    setMembers((prev) =>
      prev.map((m) => {
        if (m.id !== memberId) return m;

        if ((m.points || 0) < pointsToRedeem) {
          return m;
        }

        success = true;
        const currentPoints = m.points;
        const newHistoryEntry = {
          id: generateUUID(),
          date: new Date().toISOString(),
          type: 'redeemed',
          points: pointsToRedeem,
          concept,
          prevPoints: currentPoints,
          newPoints: currentPoints - pointsToRedeem
        };

        return {
          ...m,
          points: currentPoints - pointsToRedeem,
          history: [newHistoryEntry, ...(m.history || [])],
        };
      })
    );
    return success;
  };

  // Exponemos checkExpirations para usarlo en la UI
  return {
    members,
    addMember,
    updateMember,
    deleteMember,
    searchMember,
    addPoints,
    redeemPoints,
    checkExpirations, // <--- LA LLAVE MAESTRA DE DEBUG
  };
};