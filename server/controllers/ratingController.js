const db = require("../config/database");

const normalizeComment = (value) => {
  if (value === undefined || value === null) return null;

  const comment = String(value).trim();

  if (!comment) return null;

  return comment;
};

const validateRating = (value) => {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const rating = Number(value);

  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return undefined;
  }

  return rating;
};


// ==========================================
// GET /api/rating
// تقييم المستخدم + إحصائيات التطبيق + المراجعات
// ==========================================
exports.getRating = async (req, res) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({
        success: false,
        message: "جلسة المستخدم غير صالحة"
      });
    }

    const userResult = await db.query(
      `
      SELECT
        rating,
        comment,
        developer_reply,
        developer_reply_at,
        created_at,
        updated_at
      FROM app_ratings
      WHERE user_id = $1
      LIMIT 1
      `,
      [req.user.id]
    );

    const statsResult = await db.query(
      `
      SELECT
        COUNT(rating)::integer AS total_ratings,
        COUNT(*) FILTER (WHERE comment IS NOT NULL AND LENGTH(TRIM(comment)) > 0)::integer AS total_reviews,
        COALESCE(ROUND(AVG(rating)::numeric, 2), 0) AS average_rating,
        COUNT(*) FILTER (WHERE rating = 5)::integer AS five_star,
        COUNT(*) FILTER (WHERE rating = 4)::integer AS four_star,
        COUNT(*) FILTER (WHERE rating = 3)::integer AS three_star,
        COUNT(*) FILTER (WHERE rating = 2)::integer AS two_star,
        COUNT(*) FILTER (WHERE rating = 1)::integer AS one_star
      FROM app_ratings
      `
    );

    const ageStatsResult = await db.query(
      `
      SELECT
        COUNT(*) FILTER (
          WHERE birth_date IS NOT NULL
            AND DATE_PART('year', AGE(CURRENT_DATE, birth_date)) BETWEEN 13 AND 17
        )::integer AS age_13_17,
        COUNT(*) FILTER (
          WHERE birth_date IS NOT NULL
            AND DATE_PART('year', AGE(CURRENT_DATE, birth_date)) BETWEEN 18 AND 24
        )::integer AS age_18_24,
        COUNT(*) FILTER (
          WHERE birth_date IS NOT NULL
            AND DATE_PART('year', AGE(CURRENT_DATE, birth_date)) BETWEEN 25 AND 34
        )::integer AS age_25_34,
        COUNT(*) FILTER (
          WHERE birth_date IS NOT NULL
            AND DATE_PART('year', AGE(CURRENT_DATE, birth_date)) BETWEEN 35 AND 44
        )::integer AS age_35_44,
        COUNT(*) FILTER (
          WHERE birth_date IS NOT NULL
            AND DATE_PART('year', AGE(CURRENT_DATE, birth_date)) >= 45
        )::integer AS age_45_plus,
        COUNT(*) FILTER (
          WHERE birth_date IS NULL
        )::integer AS age_unknown
      FROM users
      `
    );

    const ageStats = ageStatsResult.rows[0];

    const reviewsResult = await db.query(
      `
      SELECT
        r.id,
        r.rating,
        r.comment,
        r.developer_reply,
        r.developer_reply_at,
        r.created_at,
        r.updated_at,
        COALESCE(NULLIF(TRIM(u.username), ''), 'مستخدم') AS username,
        u.profile_image
      FROM app_ratings r
      INNER JOIN users u
        ON u.id = r.user_id
      WHERE r.comment IS NOT NULL
        AND LENGTH(TRIM(r.comment)) > 0
      ORDER BY r.created_at DESC
      LIMIT 50
      `
    );

    const userRating = userResult.rows[0] || null;
    const stats = statsResult.rows[0];

    return res.json({
      success: true,

      rating: userRating?.rating ?? 0,

      comment: userRating?.comment ?? "",

      rated: userRating?.rating !== null &&
             userRating?.rating !== undefined,

      reviewed: !!userRating?.comment,

      developerReply: userRating?.developer_reply ?? null,

      developerReplyAt: userRating?.developer_reply_at ?? null,

      createdAt: userRating?.created_at ?? null,

      updatedAt: userRating?.updated_at ?? null,

      stats: {
        averageRating: Number(stats.average_rating || 0),

        ageGroups: {
          "13-17": Number(ageStats.age_13_17 || 0),
          "18-24": Number(ageStats.age_18_24 || 0),
          "25-34": Number(ageStats.age_25_34 || 0),
          "35-44": Number(ageStats.age_35_44 || 0),
          "45+": Number(ageStats.age_45_plus || 0),
          unknown: Number(ageStats.age_unknown || 0)
        },
        totalRatings: Number(stats.total_ratings || 0),
        totalReviews: Number(stats.total_reviews || 0),

        distribution: {
          5: Number(stats.five_star || 0),
          4: Number(stats.four_star || 0),
          3: Number(stats.three_star || 0),
          2: Number(stats.two_star || 0),
          1: Number(stats.one_star || 0)
        }
      },

      reviews: reviewsResult.rows.map(row => ({
        id: row.id,
        username: row.username,
        profileImage: row.profile_image,
        rating: row.rating,
        comment: row.comment,
        developerReply: row.developer_reply,
        developerReplyAt: row.developer_reply_at,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      }))
    });

  } catch (err) {
    console.error("❌ GET RATING ERROR:", err);

    return res.status(500).json({
      success: false,
      message: "فشل جلب بيانات التقييمات"
    });
  }
};


// ==========================================
// POST /api/rating
// إنشاء أو تحديث تقييم / تعليق
// ==========================================
exports.saveRating = async (req, res) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({
        success: false,
        message: "جلسة المستخدم غير صالحة"
      });
    }

    const rating = validateRating(req.body.rating);

    if (rating === undefined) {
      return res.status(400).json({
        success: false,
        message: "التقييم يجب أن يكون رقمًا صحيحًا بين 1 و5"
      });
    }

    const comment = normalizeComment(req.body.comment);

    if (comment && comment.length > 500) {
      return res.status(400).json({
        success: false,
        message: "التعليق يجب ألا يتجاوز 500 حرف"
      });
    }

    if (rating === null && !comment) {
      return res.status(400).json({
        success: false,
        message: "أضف تقييمًا أو تعليقًا قبل الإرسال"
      });
    }

    const result = await db.query(
      `
      INSERT INTO app_ratings (
        user_id,
        rating,
        comment
      )
      VALUES ($1, $2, $3)
      ON CONFLICT (user_id)
      DO UPDATE SET
        rating = EXCLUDED.rating,
        comment = EXCLUDED.comment,
        updated_at = NOW()
      RETURNING
        id,
        rating,
        comment,
        developer_reply,
        developer_reply_at,
        created_at,
        updated_at
      `,
      [
        req.user.id,
        rating,
        comment
      ]
    );

    return res.json({
      success: true,
      message: "تم حفظ مشاركتك بنجاح ⭐",
      data: result.rows[0]
    });

  } catch (err) {
    console.error("❌ SAVE RATING ERROR:", err);

    return res.status(500).json({
      success: false,
      message: "فشل حفظ التقييم أو التعليق"
    });
  }
};
