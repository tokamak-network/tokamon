import mongoose, { Schema, Document } from 'mongoose';

export interface ISpot extends Document {
  name: string;
  description: string;
  latitude: number;
  longitude: number;
  tokenAmount: number;
  remainingTokens: number;
  depositAmount: number;
  creatorAddress: string;
  transactionHash: string;
  isActive: boolean;
  collectedBy: string[];
  createdAt: Date;
  updatedAt: Date;
}

const SpotSchema: Schema = new Schema(
  {
    name: {
      type: String,
      required: true,
      maxlength: 50,
    },
    description: {
      type: String,
      required: true,
      maxlength: 200,
    },
    latitude: {
      type: Number,
      required: true,
      min: -90,
      max: 90,
    },
    longitude: {
      type: Number,
      required: true,
      min: -180,
      max: 180,
    },
    tokenAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    remainingTokens: {
      type: Number,
      required: true,
      min: 0,
    },
    depositAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    creatorAddress: {
      type: String,
      required: true,
      index: true,
    },
    transactionHash: {
      type: String,
      required: true,
      unique: true,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    collectedBy: [{
      type: String,
    }],
  },
  {
    timestamps: true,
  }
);

// 지리적 인덱스 생성
SpotSchema.index({ latitude: 1, longitude: 1 });

export default mongoose.model<ISpot>('Spot', SpotSchema);
