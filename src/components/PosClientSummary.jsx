import React from 'react';
import { Gift, User, UserMinus } from 'lucide-react';

export default function PosClientSummary({ client, isGuest, onAssign, onRemove, onRedeem, pointsText, pointsTone, itemCount }) {
  return (
    <div className={`pos-client-summary${client ? ' has-client' : ''}`}>
      {client ? (
        <div className={`pos-client-card${isGuest ? '' : ' is-member'}`} role="group" aria-label={isGuest ? 'Consumidor final' : 'Socio asignado'}>
          <span className="pos-client-avatar" aria-hidden="true"><User size={15} /></span>
          <div className="pos-client-identity">
            <p className="pos-client-name" title={isGuest ? 'Consumidor final' : client.name}>
              {isGuest ? 'Consumidor final' : client.name || 'Socio sin nombre'}
            </p>
            {!isGuest && (
              <div className="pos-client-details">
                <span>{client.memberNumber ? `Socio #${client.memberNumber}` : 'Socio'}</span>
                <span title="Puntos disponibles"><strong>{(Number(client.points) || 0).toLocaleString('es-AR')}</strong> puntos</span>
              </div>
            )}
          </div>
          {!isGuest && (
            <button type="button" className="pos-client-redeem" onClick={onRedeem}>
              <Gift size={13} aria-hidden="true" />Canjear
            </button>
          )}
          <button type="button" className="pos-client-remove" onClick={onRemove}
            aria-label={isGuest ? 'Quitar identificación' : 'Quitar socio'}
            title={isGuest ? 'Quitar identificación' : 'Quitar socio'}>
            <UserMinus size={14} aria-hidden="true" />
          </button>
        </div>
      ) : (
        <div className="pos-client-card is-empty">
          <span className="pos-client-avatar" aria-hidden="true"><User size={15} /></span>
          <p className="pos-client-name pos-client-identity">Sin socio asignado</p>
          <button type="button" className="pos-client-assign" onClick={onAssign}>Asignar socio</button>
        </div>
      )}
      <div className="pos-client-footer">
        {pointsText && <span className={`pos-client-points is-${pointsTone}`} title={pointsText}>{pointsText}</span>}
        <div className="pos-client-cart-meta">
          <span>{itemCount} {itemCount === 1 ? 'ítem' : 'ítems'}</span>
        </div>
      </div>
    </div>
  );
}
