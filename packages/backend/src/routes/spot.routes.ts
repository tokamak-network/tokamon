import { Router } from 'express';
import {
  createSpot,
  getNearbySpots,
  getAllSpots,
  getSpotById,
  collectToken,
  updateSpot,
  deleteSpot,
} from '../controllers/spot.controller';

const router = Router();

// 스팟 생성
router.post('/', createSpot);

// 주변 스팟 조회
router.get('/nearby', getNearbySpots);

// 모든 스팟 조회
router.get('/', getAllSpots);

// 특정 스팟 조회
router.get('/:id', getSpotById);

// 토큰 수집
router.post('/collect', collectToken);

// 스팟 업데이트
router.patch('/:id', updateSpot);

// 스팟 삭제
router.delete('/:id', deleteSpot);

export default router;
