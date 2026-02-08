import { Router } from 'express';
import {
  getUserProfile,
  updateUserProfile,
  getUserCollections,
  getUserCreatedSpots,
} from '../controllers/user.controller';

const router = Router();

// 사용자 프로필 조회
router.get('/:address', getUserProfile);

// 사용자 프로필 업데이트
router.put('/:address', updateUserProfile);

// 사용자 수집 이력
router.get('/:address/collections', getUserCollections);

// 사용자가 생성한 스팟
router.get('/:address/spots', getUserCreatedSpots);

export default router;
