/**
 * 语义记忆模块入口
 * v5.1: Embedding 服务已切换为智谱 API
 */

export {
  generateEmbedding,
  generateEmbeddings,
  isModelLoading,
  isModelReady,
  getVectorDimension,
  preloadModel,
} from './embeddingService'

export {
  addVector,
  addVectors,
  queryVectors,
  removeVector,
  getStoreStats,
  listAllItems,
} from './vectorStore'
