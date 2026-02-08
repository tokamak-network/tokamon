import mongoose, { Schema, Document } from 'mongoose';

export interface IUser extends Document {
  address: string;
  totalSteps: number;
  totalTokensEarned: number;
  totalSpotsCreated: number;
  totalSpotsCollected: number;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema: Schema = new Schema(
  {
    address: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    totalSteps: {
      type: Number,
      default: 0,
    },
    totalTokensEarned: {
      type: Number,
      default: 0,
    },
    totalSpotsCreated: {
      type: Number,
      default: 0,
    },
    totalSpotsCollected: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model<IUser>('User', UserSchema);
