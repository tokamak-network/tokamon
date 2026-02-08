import { Request, Response } from 'express';
import Spot from '../models/Spot.model';
import User from '../models/User.model';
import { logger } from '../utils/logger';

// 스팟 생성
export const createSpot = async (req: Request, res: Response) => {
  try {
    const { name, description, latitude, longitude, tokenAmount, depositAmount, creatorAddress, transactionHash } = req.body;

    const spot = new Spot({
      name,
      description,
      latitude,
      longitude,
      tokenAmount,
      remainingTokens: depositAmount,
      depositAmount,
      creatorAddress,
      transactionHash,
    });

    await spot.save();

    // 사용자 통계 업데이트
    await User.findOneAndUpdate(
      { address: creatorAddress },
      { $inc: { totalSpotsCreated: 1 } },
      { upsert: true }
    );

    logger.info(`Spot created: ${spot._id} by ${creatorAddress}`);
    res.status(201).json(spot);
  } catch (error) {
    logger.error('Error creating spot:', error);
    res.status(500).json({ error: 'Failed to create spot' });
  }
};

// 주변 스팟 조회
export const getNearbySpots = async (req: Request, res: Response) => {
  try {
    const { latitude, longitude, radius = 5000 } = req.query;

    if (!latitude || !longitude) {
      return res.status(400).json({ error: 'Latitude and longitude are required' });
    }

    const lat = parseFloat(latitude as string);
    const lon = parseFloat(longitude as string);
    const rad = parseFloat(radius as string);

    // 간단한 거리 계산 (실제로는 더 정교한 알고리즘 필요)
    const latDelta = rad / 111000; // 1도 = 약 111km
    const lonDelta = rad / (111000 * Math.cos(lat * Math.PI / 180));

    const spots = await Spot.find({
      isActive: true,
      remainingTokens: { $gt: 0 },
      latitude: { $gte: lat - latDelta, $lte: lat + latDelta },
      longitude: { $gte: lon - lonDelta, $lte: lon + lonDelta },
    });

    res.json(spots);
  } catch (error) {
    logger.error('Error fetching nearby spots:', error);
    res.status(500).json({ error: 'Failed to fetch nearby spots' });
  }
};

// 모든 스팟 조회
export const getAllSpots = async (req: Request, res: Response) => {
  try {
    const spots = await Spot.find({ isActive: true });
    res.json(spots);
  } catch (error) {
    logger.error('Error fetching all spots:', error);
    res.status(500).json({ error: 'Failed to fetch spots' });
  }
};

// 특정 스팟 조회
export const getSpotById = async (req: Request, res: Response) => {
  try {
    const spot = await Spot.findById(req.params.id);
    
    if (!spot) {
      return res.status(404).json({ error: 'Spot not found' });
    }

    res.json(spot);
  } catch (error) {
    logger.error('Error fetching spot:', error);
    res.status(500).json({ error: 'Failed to fetch spot' });
  }
};

// 토큰 수집
export const collectToken = async (req: Request, res: Response) => {
  try {
    const { spotId, userAddress } = req.body;

    const spot = await Spot.findById(spotId);

    if (!spot) {
      return res.status(404).json({ error: 'Spot not found' });
    }

    if (spot.remainingTokens < spot.tokenAmount) {
      return res.status(400).json({ error: 'Insufficient tokens in spot' });
    }

    if (spot.collectedBy.includes(userAddress)) {
      return res.status(400).json({ error: 'Already collected by this user' });
    }

    // 토큰 차감 및 수집자 추가
    spot.remainingTokens -= spot.tokenAmount;
    spot.collectedBy.push(userAddress);
    await spot.save();

    // 사용자 통계 업데이트
    await User.findOneAndUpdate(
      { address: userAddress },
      { 
        $inc: { 
          totalSpotsCollected: 1,
          totalTokensEarned: spot.tokenAmount 
        } 
      },
      { upsert: true }
    );

    logger.info(`Token collected: ${spotId} by ${userAddress}`);
    res.json({ success: true, spot });
  } catch (error) {
    logger.error('Error collecting token:', error);
    res.status(500).json({ error: 'Failed to collect token' });
  }
};

// 스팟 업데이트
export const updateSpot = async (req: Request, res: Response) => {
  try {
    const spot = await Spot.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );

    if (!spot) {
      return res.status(404).json({ error: 'Spot not found' });
    }

    res.json(spot);
  } catch (error) {
    logger.error('Error updating spot:', error);
    res.status(500).json({ error: 'Failed to update spot' });
  }
};

// 스팟 삭제
export const deleteSpot = async (req: Request, res: Response) => {
  try {
    const { userAddress } = req.body;
    const spot = await Spot.findById(req.params.id);

    if (!spot) {
      return res.status(404).json({ error: 'Spot not found' });
    }

    if (spot.creatorAddress !== userAddress) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    spot.isActive = false;
    await spot.save();

    logger.info(`Spot deleted: ${spot._id}`);
    res.json({ success: true });
  } catch (error) {
    logger.error('Error deleting spot:', error);
    res.status(500).json({ error: 'Failed to delete spot' });
  }
};
