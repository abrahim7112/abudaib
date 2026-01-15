// models/Project.js
import { Schema, model } from 'mongoose';

const projectSchema = new Schema({
  title: {
    de: { type: String, required: true },
    en: { type: String, required: true }
  },
  category: {
    de: { type: String, required: true },
    en: { type: String, required: true }
  },
  description: {
    de: { type: String, required: true },
    en: { type: String, required: true }
  },
  img: { type: String, required: true },
  url: { type: String, default: '' },   
  order: { type: Number, default: 0 }   
}, {
  timestamps: true
});

export default model('Project', projectSchema);