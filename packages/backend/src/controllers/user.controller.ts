import { Request, Response } from 'express';
import User from '../models/User.model';
import Spot from '../models/Spot.model';
import { logger } from '../utils/logger';

// 사용자 프로필 조회
export const getUserProfile = async (req: Request, res: Response) => {
  try {
    const user = await User.findOne({ address: req.params.address });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(user);
  } catch (error) {
    logger.error('Error fetching user profile:', error);
    res.status(500).json({ error: 'Failed to fetch user profile' });
  }
};

// 사용자 프로필 업데이트
export const updateUserProfile = async (req: Request, res: Response) => {
  try {
    const user = await User.findOneAndUpdate(
      { address: req.params.address },
      req.body,
      { new: true, upsert: true }
    );

    res.json(user);
  } catch (error) {
    logger.error('Error updating user profile:', error);
    res.status(500).json({ error: 'Failed to update user profile' });
  }
};

// 사용자 수집 이력
export const getUserCollections = async (req: Request, res: Response) => {
  try {
    const spots = await Spot.find({
      collectedBy: req.params.address,
    }).sort({ updatedAt: -1 });

    res.json(spots);
  } catch (error) {
    logger.error('Error fetching user collections:', error);
    res.status(500).json({ error: 'Failed to fetch collections' });
  }
};

// 사용자가 생성한 스팟
export const getUserCreatedSpots = async (req: Request, res: Response) => {
  try {
    const spots = await Spot.find({
      creatorAddress: req.params.address,
    }).sort({ createdAt: -1 });

    res.json(spots);
  } catch (error) {
    logger.error('Error fetching user spots:', error);
    res.status(500).json({ error: 'Failed to fetch user spots' });
  }
};
