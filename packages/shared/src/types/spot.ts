export interface Spot {
  id: string;
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

export interface CreateSpotRequest {
  name: string;
  description: string;
  latitude: number;
  longitude: number;
  tokenAmount: number;
  depositAmount: number;
  creatorAddress: string;
  transactionHash: string;
}

export interface CollectTokenRequest {
  spotId: string;
  userAddress: string;
  timestamp: string;
}

export interface NearbySpotQuery {
  latitude: number;
  longitude: number;
  radius?: number; // meters
}
