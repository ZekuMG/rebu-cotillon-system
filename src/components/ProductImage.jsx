// src/components/ProductImage.jsx
import React from 'react';
import { getColorForItem } from '../data';

const ProductImage = ({ item, className = '', onClick }) => {
  const hasImage = item.image && item.image.trim() !== '';
  const bgColor = getColorForItem(item.id);

  if (hasImage) {
    return (
      <div
        className={`${className} overflow-hidden cursor-pointer bg-slate-100`}
        onClick={onClick}
      >
        <img
          src={item.image}
          alt={item.title}
          className="w-full h-full object-cover"
        />
      </div>
    );
  }

  return (
    <div
      className={`${className} flex items-center justify-center p-1 cursor-pointer select-none`}
      style={{ backgroundColor: bgColor }}
      onClick={onClick}
    >
      <span className="text-white font-bold text-center leading-tight text-[9px] line-clamp-3">
        {item.title}
      </span>
    </div>
  );
};

export default ProductImage;
