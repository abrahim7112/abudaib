// models/Testimonial.js
import { Schema, model } from 'mongoose';

const testimonialSchema = new Schema({
  name: { type: String, required: true },
  role: {
    de: { type: String, required: true },
    en: { type: String, required: true }
  },
  company: { type: String, required: true },
  content: {
    de: { type: String, required: true },
    en: { type: String, required: true }
  },
  rating: { type: Number, default: 5, min: 1, max: 5 },
  order: { type: Number, default: 0 }
}, {
  timestamps: true
});

export default model('Testimonial', testimonialSchema);