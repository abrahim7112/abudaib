// models/BlogPost.js
import { Schema, model } from 'mongoose';

const blogPostSchema = new Schema({
  id: { type: String, required: true, unique: true },
  title: {
    de: { type: String, required: true },
    en: { type: String, required: true }
  },
  content: {
    de: { type: String, required: true },
    en: { type: String, required: true }
  },
  slug: { type: String, required: true, unique: true },
  image: { type: String, required: true },
  published: { type: Boolean, required: true, default: true }
}, { timestamps: true });

blogPostSchema.index({ slug: 1 });

export default model('BlogPost', blogPostSchema);