package com.clq.yhqgl

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.ui.Modifier
import com.clq.yhqgl.ui.MainScreen
import com.clq.yhqgl.ui.theme.YhqTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val deepLinkCouponId = intent.getStringExtra("couponId")
        setContent {
            YhqTheme {
                Surface(modifier = Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
                    MainScreen(initialCouponId = deepLinkCouponId)
                }
            }
        }
    }
}
